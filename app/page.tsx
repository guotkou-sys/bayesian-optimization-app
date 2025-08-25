// app/page.tsx
'use client';

import styles from './page.module.css';
import { useState, useEffect } from 'react';
import * as math from 'mathjs';

// 简单的贝叶斯优化实现
class SimpleBayesianOptimizer {
  private observations: Array<{ params: number[]; value: number }> = [];
  private bounds: number[][];
  private maximize: boolean;

  constructor(bounds: number[][], maximize: boolean = false) {
    this.bounds = bounds;
    this.maximize = maximize;
  }

  addObservation(params: number[], value: number) {
    this.observations.push({ params, value });
  }

  suggest(): number[] {
    if (this.observations.length < 3) {
      // 初始阶段：随机采样
      return this.bounds.map(([min, max]) => 
        min + Math.random() * (max - min)
      );
    }

    // 简单实现：使用上置信界(UCB)算法
    return this.acquisitionFunction();
  }

  private acquisitionFunction(): number[] {
    // 简单实现：在参数空间内随机采样，选择最佳acquisition值
    const numCandidates = 100;
    let bestCandidate: number[] = [];
    let bestAcquisition = this.maximize ? -Infinity : Infinity;

    for (let i = 0; i < numCandidates; i++) {
      const candidate = this.bounds.map(([min, max]) => 
        min + Math.random() * (max - min)
      );

      const acquisition = this.calculateAcquisition(candidate);

      if ((this.maximize && acquisition > bestAcquisition) || 
          (!this.maximize && acquisition < bestAcquisition)) {
        bestAcquisition = acquisition;
        bestCandidate = candidate;
      }
    }

    return bestCandidate;
  }

  private calculateAcquisition(params: number[]): number {
    // 简单实现：使用均值 + 探索项
    const mean = this.estimateMean(params);
    const exploration = this.calculateExploration(params);
    
    return this.maximize ? mean + exploration : mean - exploration;
  }

  private estimateMean(params: number[]): number {
    // 简单实现：基于距离的加权平均
    let totalWeight = 0;
    let weightedSum = 0;

    for (const obs of this.observations) {
      const distance = this.calculateDistance(params, obs.params);
      const weight = 1 / (1 + distance);
      weightedSum += weight * obs.value;
      totalWeight += weight;
    }

    return totalWeight > 0 ? weightedSum / totalWeight : 0;
  }

  private calculateExploration(params: number[]): number {
    // 探索项：与最近观测点的距离
    let minDistance = Infinity;
    
    for (const obs of this.observations) {
      const distance = this.calculateDistance(params, obs.params);
      if (distance < minDistance) {
        minDistance = distance;
      }
    }

    return minDistance === Infinity ? 1 : minDistance;
  }

  private calculateDistance(a: number[], b: number[]): number {
    return Math.sqrt(a.reduce((sum, val, i) => sum + Math.pow(val - b[i], 2), 0));
  }

  getBestResult(): { params: number[]; value: number } {
    if (this.observations.length === 0) {
      return { params: [], value: 0 };
    }

    let bestIndex = 0;
    for (let i = 1; i < this.observations.length; i++) {
      if ((this.maximize && this.observations[i].value > this.observations[bestIndex].value) ||
          (!this.maximize && this.observations[i].value < this.observations[bestIndex].value)) {
        bestIndex = i;
      }
    }

    return this.observations[bestIndex];
  }
}

// 定义类型
interface Parameter {
  name: string;
  type: 'continuous' | 'categorical' | 'integer';
  range: string;
}

interface HistoryItem {
  params: Record<string, any>;
  value: string;
}

interface BestResult {
  params: Record<string, any>;
  value: number;
}

interface ManualTrial {
  params: Record<string, any>;
  value: string;
}

export default function HomePage() {
  const [parameters, setParameters] = useState<Parameter[]>([
    { name: 'temperature10x', type: 'continuous', range: '0-10' },
    { name: '压力', type: 'categorical', range: 'a,b,c' }
  ]);
  const [direction, setDirection] = useState('minimize');
  const [results, setResults] = useState<BestResult | null>(null);
  const [isOptimizing, setIsOptimizing] = useState(false);
  const [currentParams, setCurrentParams] = useState<Record<string, any> | null>(null);
  const [numericParams, setNumericParams] = useState<number[] | null>(null);
  const [objectiveValue, setObjectiveValue] = useState('');
  const [currentIter, setCurrentIter] = useState(0);
  const [totalIter, setTotalIter] = useState(0);
  const [history, setHistory] = useState<HistoryItem[]>([]);
  const [error, setError] = useState('');
  const [categoryMaps, setCategoryMaps] = useState<Record<string, string[]>>({});
  const [isLoading, setIsLoading] = useState(false);
  const [phase, setPhase] = useState<'setup' | 'manual' | 'optimization'>('setup');
  const [manualTrials, setManualTrials] = useState<ManualTrial[]>([]);
  const [currentTrialIndex, setCurrentTrialIndex] = useState(0);
  const [trialCount, setTrialCount] = useState(3);
  const [savedConfig, setSavedConfig] = useState<any>(null);
  const [optimizer, setOptimizer] = useState<SimpleBayesianOptimizer | null>(null);
  
  const [showImportOptions, setShowImportOptions] = useState(false);
  const [importOption, setImportOption] = useState<'continue' | 'new'>('continue');

  const importHistoryData = () => {
    if (history.length === 0) {
      setError('没有可导入的历史数据');
      return;
    }

    const trialsToImport = history.slice(0, Math.min(trialCount, history.length));
    
    const trials: ManualTrial[] = trialsToImport.map(trial => ({
      params: { ...trial.params },
      value: trial.value
    }));

    while (trials.length < trialCount) {
      trials.push({
        params: Object.fromEntries(parameters.filter(p => p.name.trim()).map(p => [p.name.trim(), ''])),
        value: ''
      });
    }

    setManualTrials(trials);
    setCurrentTrialIndex(0);
    setError('');
  };

  const loadFromStorage = () => {
    try {
      const saved = localStorage.getItem('bayesianOptimizationData');
      if (saved) {
        const data = JSON.parse(saved);
        setHistory(data.history || []);
        setSavedConfig(data.config || null);
        if (data.phase === 'optimization') {
          setPhase('setup');
        }
      }
    } catch (e) {
      console.error('加载存储数据失败:', e);
    }
  };

  const saveToStorage = (data: any) => {
    try {
      localStorage.setItem('bayesianOptimizationData', JSON.stringify(data));
    } catch (e) {
      console.error('保存数据失败:', e);
    }
  };

  const clearStorage = () => {
    try {
      localStorage.removeItem('bayesianOptimizationData');
      setHistory([]);
      setSavedConfig(null);
    } catch (e) {
      console.error('清空存储数据失败:', e);
    }
  };

  const startManualInput = () => {
    setError('');
    const validParameters = parameters.filter(param => param.name.trim() && param.range.trim());
    if (validParameters.length === 0) {
      setError('请至少定义一个有效的参数。');
      return;
    }

    if (trialCount < 3 || trialCount > 10) {
      setError('试验数量必须在3到10之间。');
      return;
    }

    const trials: ManualTrial[] = Array(trialCount).fill(null).map(() => ({
      params: Object.fromEntries(validParameters.map(param => [param.name.trim(), ''])),
      value: ''
    }));

    setManualTrials(trials);
    setPhase('manual');
    setCurrentTrialIndex(0);
  };

  const handleManualParamChange = (trialIndex: number, paramName: string, value: string) => {
    const updatedTrials = [...manualTrials];
    const paramConfig = parameters.find(p => p.name.trim() === paramName);
    
    if (paramConfig) {
      if (paramConfig.type === 'integer') {
        updatedTrials[trialIndex].params[paramName] = value.replace(/[^\d]/g, '');
      } else if (paramConfig.type === 'continuous') {
        updatedTrials[trialIndex].params[paramName] = value.replace(/[^\d.]/g, '');
      } else {
        updatedTrials[trialIndex].params[paramName] = value;
      }
    } else {
      updatedTrials[trialIndex].params[paramName] = value;
    }
    
    setManualTrials(updatedTrials);
  };

  const handleManualValueChange = (trialIndex: number, value: string) => {
    const updatedTrials = [...manualTrials];
    updatedTrials[trialIndex].value = value.replace(/[^\d.]/g, '');
    setManualTrials(updatedTrials);
  };

  const submitManualTrial = () => {
    const currentTrial = manualTrials[currentTrialIndex];
    
    const emptyParams = Object.entries(currentTrial.params)
      .filter(([_, value]) => !value)
      .map(([key]) => key);

    if (emptyParams.length > 0) {
      setError(`请填写参数: ${emptyParams.join(', ')}`);
      return;
    }

    if (!currentTrial.value || isNaN(parseFloat(currentTrial.value))) {
      setError('请输入有效的目标值。');
      return;
    }

    const newHistory = [...history, { 
      params: currentTrial.params, 
      value: currentTrial.value 
    }];
    setHistory(newHistory);

    saveToStorage({
      history: newHistory,
      phase: 'manual',
      config: { parameters, direction, trialCount }
    });

    if (currentTrialIndex < trialCount - 1) {
      setCurrentTrialIndex(currentTrialIndex + 1);
      setError('');
    } else {
      startOptimization();
    }
  };

  const startOptimization = () => {
    setError('');
    let localCategoryMaps: Record<string, string[]> = {};
    const bounds: number[][] = [];

    for (let param of parameters) {
      const name = param.name.trim();
      if (!name) continue;

      if (param.type === 'categorical') {
        const categories = param.range.trim().split(',').map(s => s.trim().replace(/['"]/g, ''));
        if (categories.length < 2) {
          setError(`分类参数 ${name} 必须至少包含2个类别。`);
          return;
        }
        localCategoryMaps[name] = categories;
        bounds.push([0, categories.length - 1]);
      } else {
        const parsedRange = param.range.trim().replace(/[\[\]]/g, '').split(/[-, ]+/).map(Number);
        if (parsedRange.length !== 2 || isNaN(parsedRange[0]) || isNaN(parsedRange[1])) {
          setError(`${name} 的范围无效。请使用例如 0-10 的格式。`);
          return;
        }
        bounds.push([parsedRange[0], parsedRange[1]]);
      }
    }

    setCategoryMaps(localCategoryMaps);

    try {
      setIsLoading(true);
      
      const bayesOpt = new SimpleBayesianOptimizer(bounds, direction === 'maximize');
      
      // 添加所有手动试验结果到优化器
      for (const trial of manualTrials) {
        const numericParams: number[] = [];
        
        parameters.forEach(param => {
          const name = param.name.trim();
          if (!name) return;
          
          if (param.type === 'categorical') {
            const categories = localCategoryMaps[name];
            const index = categories.indexOf(trial.params[name]);
            numericParams.push(index !== -1 ? index : 0);
          } else {
            numericParams.push(parseFloat(trial.params[name]) || 0);
          }
        });

        bayesOpt.addObservation(numericParams, parseFloat(trial.value));
      }

      setOptimizer(bayesOpt);
      setIsOptimizing(true);
      setPhase('optimization');
      setCurrentIter(manualTrials.length + 1);
      setTotalIter(manualTrials.length + 30);
      
      saveToStorage({
        history,
        phase: 'optimization',
        config: { parameters, direction, trialCount }
      });
      
      fetchNextSuggest(bayesOpt, localCategoryMaps);
    } catch (e: any) {
      setError(`优化配置错误: ${e.message}`);
      console.error('优化配置错误:', e);
    } finally {
      setIsLoading(false);
    }
  };

  const fetchNextSuggest = (bayesOpt: SimpleBayesianOptimizer, maps: Record<string, string[]>) => {
    try {
      setIsLoading(true);
      
      const nextParams = bayesOpt.suggest();
      setNumericParams(nextParams);

      // 转换用于显示
      const displayParams: Record<string, any> = {};
      parameters.forEach((param, index) => {
        const name = param.name.trim();
        if (!name) return;
        
        if (param.type === 'categorical') {
          const categories = maps[name];
          const idx = Math.round(nextParams[index]);
          displayParams[name] = categories[Math.max(0, Math.min(idx, categories.length - 1))];
        } else if (param.type === 'integer') {
          displayParams[name] = Math.round(nextParams[index]).toString();
        } else {
          displayParams[name] = nextParams[index].toFixed(4);
        }
      });

      setCurrentParams(displayParams);
      setObjectiveValue('');
    } catch (e: any) {
      setError(`建议错误: ${e.message}`);
      setIsOptimizing(false);
    } finally {
      setIsLoading(false);
    }
  };

  const handleRegister = () => {
    if (!objectiveValue || isNaN(parseFloat(objectiveValue))) {
      setError('请输入有效的目标值。');
      return;
    }

    if (!optimizer || !numericParams) {
      setError('优化器未初始化');
      return;
    }

    try {
      setIsLoading(true);
      
      optimizer.addObservation(numericParams, parseFloat(objectiveValue));

      const newHistory = [...history, { params: currentParams, value: objectiveValue }];
      setHistory(newHistory);

      saveToStorage({
        history: newHistory,
        phase: 'optimization',
        config: savedConfig
      });

      if (currentIter >= totalIter) {
        const bestResult = optimizer.getBestResult();
        
        // 转换最佳参数用于显示
        const bestDisplayParams: Record<string, any> = {};
        parameters.forEach((param, index) => {
          const name = param.name.trim();
          if (!name) return;
          
          if (param.type === 'categorical') {
            const categories = categoryMaps[name];
            const idx = Math.round(bestResult.params[index]);
            bestDisplayParams[name] = categories[Math.max(0, Math.min(idx, categories.length - 1))];
          } else if (param.type === 'integer') {
            bestDisplayParams[name] = Math.round(bestResult.params[index]).toString();
          } else {
            bestDisplayParams[name] = bestResult.params[index].toFixed(4);
          }
        });

        setResults({
          params: bestDisplayParams,
          value: bestResult.value
        });
        
        setIsOptimizing(false);
        clearStorage();
      } else {
        setCurrentIter(currentIter + 1);
        fetchNextSuggest(optimizer, categoryMaps);
      }
    } catch (e: any) {
      setError(`注册错误: ${e.message}`);
    } finally {
      setIsLoading(false);
    }
  };

  const resumeOptimization = () => {
    if (!savedConfig) return;
    
    setParameters(savedConfig.parameters);
    setDirection(savedConfig.direction);
    setTrialCount(savedConfig.trialCount);
    
    setPhase('optimization');
    setIsOptimizing(true);
    setCurrentIter(history.length + 1);
    setTotalIter(history.length + 30);
    
    try {
      setIsLoading(true);
      
      // 重新创建优化器
      const bounds: number[][] = [];
      const localCategoryMaps: Record<string, string[]> = {};
      
      for (let param of savedConfig.parameters) {
        const name = param.name.trim();
        if (!name) continue;

        if (param.type === 'categorical') {
          const categories = param.range.trim().split(',').map(s => s.trim().replace(/['"]/g, ''));
          localCategoryMaps[name] = categories;
          bounds.push([0, categories.length - 1]);
        } else {
          const parsedRange = param.range.trim().replace(/[\[\]]/g, '').split(/[-, ]+/).map(Number);
          bounds.push([parsedRange[0], parsedRange[1]]);
        }
      }

      setCategoryMaps(localCategoryMaps);
      
      const bayesOpt = new SimpleBayesianOptimizer(bounds, savedConfig.direction === 'maximize');
      
      // 添加所有历史观察
      history.forEach(item => {
        const numericParams: number[] = [];
        
        savedConfig.parameters.forEach((param: Parameter) => {
          const name = param.name.trim();
          if (!name) return;
          
          if (param.type === 'categorical') {
            const categories = localCategoryMaps[name];
            const index = categories.indexOf(item.params[name]);
            numericParams.push(index !== -1 ? index : 0);
          } else {
            numericParams.push(parseFloat(item.params[name]) || 0);
          }
        });

        bayesOpt.addObservation(numericParams, parseFloat(item.value));
      });
      
      setOptimizer(bayesOpt);
      fetchNextSuggest(bayesOpt, localCategoryMaps);
    } catch (e: any) {
      setError(`恢复优化失败: ${e.message}`);
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    loadFromStorage();
  }, []);

  return (
    <div className={styles.container}>
      <h1 className={styles.title}>在线贝叶斯优化</h1>

      {error && <p className={styles.error}>{error}</p>}

      {savedConfig && phase === 'setup' && (
        <div className={styles.resumeSection}>
          <h2>继续上次优化？</h2>
          <p>检测到未完成的优化任务（{history.length} 次试验）</p>
          <button className={styles.button} onClick={resumeOptimization}>继续优化</button>
          <button className={styles.secondaryButton} onClick={clearStorage}>清除并重新开始</button>
        </div>
      )}

      {phase === 'setup' && (
        <section className={styles.section}>
          <h2>参数设置</h2>
          <p>定义您的优化参数和初始条件。</p>
          {parameters.map((param, index) => (
            <div key={index} className={styles.paramConfig}>
              <div className={styles.inputGroup}>
                <label htmlFor={`parameterName-${index}`}>参数名称:</label>
                <input
                  type="text"
                  id={`parameterName-${index}`}
                  value={param.name}
                  onChange={(e) => {
                    const newParameters = [...parameters];
                    newParameters[index].name = e.target.value;
                    setParameters(newParameters);
                  }}
                />
              </div>

              <div className={styles.inputGroup}>
                <label htmlFor={`parameterType-${index}`}>数据类型:</label>
                <select
                  id={`parameterType-${index}`}
                  value={param.type}
                  onChange={(e) => {
                    const newParameters = [...parameters];
                    newParameters[index].type = e.target.value as 'continuous' | 'categorical' | 'integer';
                    setParameters(newParameters);
                  }}
                >
                  <option value="continuous">连续</option>
                  <option value="categorical">分类</option>
                  <option value="integer">整数</option>
                </select>
              </div>

              <div className={styles.inputGroup}>
                <label htmlFor={`parameterRange-${index}`}>范围/类别:</label>
                <input
                  type="text"
                  id={`parameterRange-${index}`}
                  placeholder={param.type === 'categorical' ? '例如: a,b,c' : '例如: 0-10'}
                  value={param.range}
                  onChange={(e) => {
                    const newParameters = [...parameters];
                    newParameters[index].range = e.target.value;
                    setParameters(newParameters);
                  }}
                />
                <small>
                  {param.type === 'categorical' 
                    ? '用逗号分隔的类别（如: a,b,c）'
                    : '数字范围（如: 0-100 或 1.5-9.8）'}
                </small>
              </div>
              {parameters.length > 1 && (
                <button className={styles.removeButton} onClick={() => {
                  const newParameters = parameters.filter((_, i) => i !== index);
                  setParameters(newParameters);
                }}>删除参数</button>
              )}
            </div>
          ))}

          <button className={styles.button} onClick={() => {
            setParameters([...parameters, { name: '', type: 'continuous', range: '' }]);
          }}>
            添加参数
          </button>

          <div className={styles.inputGroup}>
            <label>试验数量 (3-10):</label>
            <input
              type="number"
              min="3"
              max="10"
              value={trialCount}
              onChange={(e) => setTrialCount(Number(e.target.value))}
            />
          </div>

          <div className={styles.inputGroup}>
            <label>优化方向:</label>
            <select value={direction} onChange={(e) => setDirection(e.target.value)}>
              <option value="minimize">最小化</option>
              <option value="maximize">最大化</option>
            </select>
          </div>

          <button 
            className={styles.button} 
            onClick={startManualInput} 
            disabled={isLoading}
          >
            输入已有试验结果
          </button>
        </section>
      )}

      {phase === 'manual' && (
        <section className={styles.section}>
          <h2>输入已有试验结果 ({currentTrialIndex + 1}/{trialCount})</h2>
          <p>请输入您已经完成的试验的参数值和目标值（最少3个，最多10个）。</p>
          
          {/* 添加导入选项 */}
          {history.length > 0 && currentTrialIndex === 0 && (
            <div className={styles.importSection}>
              <h3>检测到历史数据</h3>
              <p>发现 {history.length} 个历史试验记录，您想要：</p>
              <div className={styles.importOptions}>
                <label>
                  <input
                    type="radio"
                    value="continue"
                    checked={importOption === 'continue'}
                    onChange={(e) => setImportOption(e.target.value as 'continue' | 'new')}
                  />
                  继续使用历史数据优化
                </label>
                <label>
                  <input
                    type="radio"
                    value="new"
                    checked={importOption === 'new'}
                    onChange={(e) => setImportOption(e.target.value as 'continue' | 'new')}
                  />
                  开始新的优化任务
                </label>
              </div>
              {importOption === 'continue' && (
                <button className={styles.button} onClick={importHistoryData}>
                  一键导入历史数据
                </button>
              )}
            </div>
          )}

          <div className={styles.trial}>
            <h3>试验 {currentTrialIndex + 1}:</h3>
            
            {Object.entries(manualTrials[currentTrialIndex].params).map(([paramName]) => {
              // 检查这个参数值是否来自历史数据
              const isFromHistory = history[currentTrialIndex]?.params[paramName] !== undefined;
              
              return (
                <div key={paramName} className={styles.inputGroup}>
                  <label>{paramName}:</label>
                  <input
                    type="text"
                    value={manualTrials[currentTrialIndex].params[paramName]}
                    onChange={(e) => handleManualParamChange(currentTrialIndex, paramName, e.target.value)}
                    placeholder={`输入 ${paramName} 的值`}
                    className={isFromHistory ? styles.historyValue : ''}
                  />
                  {isFromHistory && <span className={styles.historyBadge}>历史数据</span>}
                </div>
              );
            })}
            
            <div className={styles.inputGroup}>
              <label>目标值:</label>
              <input
                type="text"
                value={manualTrials[currentTrialIndex].value}
                onChange={(e) => handleManualValueChange(currentTrialIndex, e.target.value)}
                placeholder="输入目标值"
                className={history[currentTrialIndex]?.value ? styles.historyValue : ''}
              />
              {history[currentTrialIndex]?.value && (
                <span className={styles.historyBadge}>历史数据</span>
              )}
            </div>
            
            <div className={styles.buttonGroup}>
              {currentTrialIndex > 0 && (
                <button 
                  className={styles.secondaryButton} 
                  onClick={() => setCurrentTrialIndex(currentTrialIndex - 1)}
                >
                  上一步
                </button>
              )}
              
              <button 
                className={styles.button} 
                onClick={submitManualTrial}
              >
                {currentTrialIndex < trialCount - 1 ? '保存并继续' : '保存并开始优化'}
              </button>

              {/* 添加快速跳转按钮 */}
              {trialCount > 1 && (
                <div className={styles.quickNav}>
                  {Array.from({ length: trialCount }, (_, i) => (
                    <button
                      key={i}
                      className={`${styles.navButton} ${currentTrialIndex === i ? styles.active : ''}`}
                      onClick={() => setCurrentTrialIndex(i)}
                    >
                      {i + 1}
                    </button>
                  ))}
                </div>
              )}
            </div>
          </div>

          {error && <p className={styles.error}>{error}</p>}

          <div className={styles.progress}>
            <h3>进度:</h3>
            {manualTrials.map((trial, index) => (
              <div key={index} className={styles.progressItem}>
                试验 {index + 1}: {trial.value ? '已完成' : '待完成'}
                {history[index] && <span className={styles.historyIndicator}>(历史)</span>}
              </div>
            ))}
          </div>
        </section>
      )}

      {phase === 'optimization' && isOptimizing && (
        <section className={styles.section}>
          <h2>贝叶斯优化建议 (迭代 {currentIter}/{totalIter})</h2>
          {currentParams ? (
            <div>
              <p>使用以下参数运行实验:</p>
              <pre className={styles.codeBlock}>{JSON.stringify(currentParams, null, 2)}</pre>
              <div className={styles.inputGroup}>
                <label>输入目标值:</label>
                <input
                  type="text"
                  value={objectiveValue}
                  onChange={(e) => setObjectiveValue(e.target.value.replace(/[^\d.]/g, ''))}
                  placeholder="输入实验结果"
                />
              </div>
              <button 
                className={styles.button} 
                onClick={handleRegister}
                disabled={isLoading}
              >
                {isLoading ? '提交中...' : '提交实验结果'}
              </button>
            </div>
          ) : (
            <p className={styles.loadingText}>正在生成优化建议...</p>
          )}
        </section>
      )}

      <section className={styles.section}>
        <h2>优化结果</h2>
        {error && <p className={styles.error}>{error}</p>}
        
        {history.length > 0 && (
          <div>
            <h3>历史记录 ({history.length} 次试验)</h3>
            <div className={styles.history}>
              {history.map((item, index) => (
                <div key={index} className={styles.historyItem}>
                  <strong>试验 {index + 1}:</strong>
                  <div>参数: {JSON.stringify(item.params)}</div>
                  <div>目标值: {item.value}</div>
                </div>
              ))}
            </div>
          </div>
        )}
        
        {results && (
          <div className={styles.results}>
            <h3>最佳结果</h3>
            <div><strong>最佳参数:</strong> {JSON.stringify(results.params)}</div>
            <div><strong>最佳目标值:</strong> {results.value}</div>
          </div>
        )}
        
        {phase === 'setup' && !results && !savedConfig && (
          <p>优化结果将显示在这里。</p>
        )}
      </section>
    </div>
  );
}
