// app/page.tsx
'use client';

import styles from './page.module.css';
import { useState, useEffect } from 'react';

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
  const [numericParams, setNumericParams] = useState<Record<string, any> | null>(null);
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
  const [trialCount, setTrialCount] = useState(3); // 默认3个试验
  const [savedConfig, setSavedConfig] = useState<any>(null);
  // 在状态定义部分添加新状态
  const [showImportOptions, setShowImportOptions] = useState(false);
  const [importOption, setImportOption] = useState<'continue' | 'new'>('continue');
  
  const API_URL = 'http://localhost:5000';

  // 添加一键导入历史数据的功能
  const importHistoryData = () => {
    if (history.length === 0) {
      setError('没有可导入的历史数据');
      return;
    }

    // 使用历史数据的前trialCount个试验
    const trialsToImport = history.slice(0, Math.min(trialCount, history.length));
    
    const trials: ManualTrial[] = trialsToImport.map(trial => ({
      params: { ...trial.params },
      value: trial.value
    }));

    // 如果历史数据数量少于要求的试验数量，补充空试验
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

  // 从localStorage加载数据
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

  // 保存数据到localStorage
  const saveToStorage = (data: any) => {
    try {
      localStorage.setItem('bayesianOptimizationData', JSON.stringify(data));
    } catch (e) {
      console.error('保存数据失败:', e);
    }
  };

  // 清空存储数据
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
    // 验证参数
    const validParameters = parameters.filter(param => param.name.trim() && param.range.trim());
    if (validParameters.length === 0) {
      setError('请至少定义一个有效的参数。');
      return;
    }

    if (trialCount < 3 || trialCount > 10) {
      setError('试验数量必须在3到10之间。');
      return;
    }

    // 创建指定数量的空试验记录
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
    
    // 找到对应的参数配置
    const paramConfig = parameters.find(p => p.name.trim() === paramName);
    
    if (paramConfig) {
      // 根据参数类型进行适当的转换
      if (paramConfig.type === 'integer') {
        // 对于整数类型，只允许数字
        updatedTrials[trialIndex].params[paramName] = value.replace(/[^\d]/g, '');
      } else if (paramConfig.type === 'continuous') {
        // 对于连续类型，允许数字和小数点
        updatedTrials[trialIndex].params[paramName] = value.replace(/[^\d.]/g, '');
      } else {
        // 对于分类类型，直接使用字符串
        updatedTrials[trialIndex].params[paramName] = value;
      }
    } else {
      updatedTrials[trialIndex].params[paramName] = value;
    }
    
    setManualTrials(updatedTrials);
  };

  const handleManualValueChange = (trialIndex: number, value: string) => {
    const updatedTrials = [...manualTrials];
    // 只允许数字和小数点用于目标值
    updatedTrials[trialIndex].value = value.replace(/[^\d.]/g, '');
    setManualTrials(updatedTrials);
  };

  const submitManualTrial = () => {
    const currentTrial = manualTrials[currentTrialIndex];
    
    // 验证当前试验的所有参数都已填写
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

    // 添加到历史记录
    const newHistory = [...history, { 
      params: currentTrial.params, 
      value: currentTrial.value 
    }];
    setHistory(newHistory);

    // 保存到本地存储
    saveToStorage({
      history: newHistory,
      phase: 'manual',
      config: { parameters, direction, trialCount }
    });

    if (currentTrialIndex < trialCount - 1) {
      setCurrentTrialIndex(currentTrialIndex + 1);
      setError('');
    } else {
      // 所有手动试验完成，开始优化
      startOptimization();
    }
  };

  const startOptimization = async () => {
    setError('');
    let localCategoryMaps: Record<string, string[]> = {};
    const paramNames: string[] = [];
    const bounds: [number, number][] = [];
    const discreteParams: number[][] = [];

    for (let param of parameters) {
      const name = param.name.trim();
      if (!name) continue;
      paramNames.push(name);

      let lower: number, upper: number, discretes: number[] = [];
      if (param.type === 'categorical') {
        const categories = param.range.trim().split(',').map(s => s.trim().replace(/['"]/g, ''));
        if (categories.length < 2) {
          setError(`分类参数 ${name} 必须至少包含2个类别。`);
          return;
        }
        localCategoryMaps[name] = categories;
        lower = 0;
        upper = categories.length - 1;
        discretes = Array.from({length: categories.length}, (_, k) => k);
      } else {
        const parsedRange = param.range.trim().replace(/[\[\]]/g, '').split(/[-, ]+/).map(Number);
        if (parsedRange.length !== 2 || isNaN(parsedRange[0]) || isNaN(parsedRange[1])) {
          setError(`${name} 的范围无效。请使用例如 0-10 的格式。`);
          return;
        }
        lower = parsedRange[0];
        upper = parsedRange[1];
        if (param.type === 'integer') {
          discretes = Array.from({length: upper - lower + 1}, (_, k) => lower + k);
        }
      }
      bounds.push([lower, upper]);
      discreteParams.push(discretes.length > 0 ? discretes : []);
    }

    // 保存categoryMaps到状态
    setCategoryMaps(localCategoryMaps);

    const configData = {
      param_names: paramNames,
      bounds: bounds,
      discrete_params: discreteParams,
      init_points: 1, // 改为至少1个初始点
      max_iter: 30,
      maximize: direction === 'maximize',
      objective_name: 'objective',
      additional_metric_name: null
    };

    try {
      setIsLoading(true);
      const configRes = await fetch(`${API_URL}/configure`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(configData)
      });
      
      if (!configRes.ok) {
        const errorText = await configRes.text();
        throw new Error(`HTTP ${configRes.status}: ${errorText}`);
      }
      
      const configJson = await configRes.json();
      if (!configJson.success) {
        setError(configJson.error || '配置失败');
        setIsLoading(false);
        return;
      }

      // 注册所有手动试验结果
      for (const trial of manualTrials) {
        // 对于分类参数，需要将标签转换为索引
        const numericParams: Record<string, any> = { ...trial.params };
        
        Object.keys(localCategoryMaps).forEach(paramName => {
          const categoryIndex = localCategoryMaps[paramName].indexOf(trial.params[paramName]);
          if (categoryIndex !== -1) {
            numericParams[paramName] = categoryIndex;
          } else {
            // 如果找不到对应的分类索引，尝试直接使用数值
            numericParams[paramName] = parseFloat(trial.params[paramName]) || trial.params[paramName];
          }
        });

        // 确保所有参数都是数值类型
        Object.keys(numericParams).forEach(key => {
          if (typeof numericParams[key] === 'string' && !isNaN(parseFloat(numericParams[key]))) {
            numericParams[key] = parseFloat(numericParams[key]);
          }
        });

        const registerData = {
          params: numericParams,
          objective_value: parseFloat(trial.value)
        };

        console.log('注册试验数据:', registerData);

        const regRes = await fetch(`${API_URL}/register`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(registerData)
        });
        
        if (!regRes.ok) {
          const errorText = await regRes.text();
          console.error('注册失败:', errorText);
          throw new Error(`HTTP ${regRes.status}: ${errorText}`);
        }

        const regJson = await regRes.json();
        if (!regJson.success) {
          console.error('注册响应失败:', regJson);
          throw new Error(regJson.error || '注册失败');
        }
      }

      setIsOptimizing(true);
      setPhase('optimization');
      setCurrentIter(manualTrials.length + 1);
      setTotalIter(manualTrials.length + 30);
      
      // 保存优化配置到本地存储
      saveToStorage({
        history,
        phase: 'optimization',
        config: { parameters, direction, trialCount, configData }
      });
      
      await fetchNextSuggest(localCategoryMaps);
    } catch (e: any) {
      setError(`配置错误: ${e.message}. 请确保Flask服务器运行在 ${API_URL}。`);
      console.error('优化配置错误:', e);
    } finally {
      setIsLoading(false);
    }
  };

  const fetchNextSuggest = async (maps: Record<string, string[]>) => {
    try {
      setIsLoading(true);
      const suggestRes = await fetch(`${API_URL}/suggest`);
      if (!suggestRes.ok) {
        const errorText = await suggestRes.text();
        throw new Error(`HTTP ${suggestRes.status}: ${errorText}`);
      }
      
      const params = await suggestRes.json();
      setNumericParams(params);

      // 映射用于显示
      const displayParams = {...params};
      Object.keys(maps).forEach(name => {
        const idx = Math.round(params[name]);
        displayParams[name] = maps[name][idx];
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

  const handleRegister = async () => {
    if (!objectiveValue || isNaN(parseFloat(objectiveValue))) {
      setError('请输入有效的目标值。');
      return;
    }

    const registerData = {
      params: numericParams,
      objective_value: parseFloat(objectiveValue)
    };

    try {
      setIsLoading(true);
      const regRes = await fetch(`${API_URL}/register`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(registerData)
      });
      
      if (!regRes.ok) {
        const errorText = await regRes.text();
        throw new Error(`HTTP ${regRes.status}: ${errorText}`);
      }
      
      const regJson = await regRes.json();
      if (!regJson.success) {
        setError(regJson.error || '注册失败');
        return;
      }

      const newHistory = [...history, { params: currentParams, value: objectiveValue }];
      setHistory(newHistory);

      // 更新本地存储
      saveToStorage({
        history: newHistory,
        phase: 'optimization',
        config: savedConfig
      });

      if (currentIter >= totalIter) {
        const bestRes = await fetch(`${API_URL}/best_result`);
        if (!bestRes.ok) {
          const errorText = await bestRes.text();
          throw new Error(`HTTP ${bestRes.status}: ${errorText}`);
        }
        
        const bestJson = await bestRes.json();
        // 映射最佳参数用于显示
        Object.keys(categoryMaps).forEach(name => {
          const idx = Math.round(bestJson.params[name]);
          bestJson.params[name] = categoryMaps[name][idx];
        });
        setResults(bestJson);
        setIsOptimizing(false);
        
        // 优化完成，清空存储
        clearStorage();
      } else {
        setCurrentIter(currentIter + 1);
        await fetchNextSuggest(categoryMaps);
      }
    } catch (e: any) {
      setError(`注册错误: ${e.message}`);
    } finally {
      setIsLoading(false);
    }
  };

  // 恢复优化会话
  const resumeOptimization = async () => {
    if (!savedConfig) return;
    
    setParameters(savedConfig.parameters);
    setDirection(savedConfig.direction);
    setTrialCount(savedConfig.trialCount);
    
    // 直接开始优化
    setPhase('optimization');
    setIsOptimizing(true);
    setCurrentIter(history.length + 1);
    setTotalIter(history.length + 30);
    
    try {
      setIsLoading(true);
      const configRes = await fetch(`${API_URL}/configure`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(savedConfig.configData)
      });
      
      if (configRes.ok) {
        await fetchNextSuggest(categoryMaps);
      }
    } catch (e: any) {
      setError(`恢复优化失败: ${e.message}`);
    } finally {
      setIsLoading(false);
    }
  };

  // 组件挂载时加载存储数据
  useEffect(() => {
    loadFromStorage();
  }, []);

  return (
    <div className={styles.container}>
      <h1 className={styles.title}>在线贝叶斯优化</h1>

      {savedConfig && phase === 'setup' && (
        <div className={styles.recoveryBanner}>
          <p>检测到未完成的优化会话，包含 {history.length} 个历史试验。</p>
          <button className={styles.button} onClick={resumeOptimization}>
            恢复优化
          </button>
          <button className={styles.secondaryButton} onClick={clearStorage}>
            开始新的优化
          </button>
        </div>
      )}

      {phase === 'setup' && (
        <section className={styles.section}>
          <h2>优化参数设置</h2>
          <p>请在下面定义您的优化参数。为每个参数提供名称、数据类型和范围或类别。</p>

          {parameters.map((param, index) => (
            <div key={index} className={styles.parameterInputGroup}>
              <h3>参数 {index + 1}</h3>
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
                    newParameters[index].type = e.target.value as any;
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
    // 修改手动输入部分的JSX
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