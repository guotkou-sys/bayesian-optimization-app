import numpy as np
from scipy.stats import norm
from scipy.optimize import minimize
from scipy.stats.qmc import LatinHypercube, scale
from flask import Flask, request, jsonify, render_template
import json
import logging
from flask_cors import CORS  # New import

# Set up logging
logging.basicConfig(level=logging.DEBUG)
logger = logging.getLogger(__name__)

# Define the RBF kernel
def rbf_kernel(X1, X2, length_scale=1.0, variance=1.0):
    sqdist = np.sum(X1**2, 1).reshape(-1, 1) + np.sum(X2**2, 1) - 2 * np.dot(X1, X2.T)
    return variance**2 * np.exp(-0.5 / length_scale**2 * sqdist)

# Simple Gaussian Process Regressor
class GaussianProcessRegressor:
    def __init__(self, kernel=rbf_kernel, noise=1e-6, length_scale=1.0, variance=1.0):
        self.kernel = lambda X1, X2: kernel(X1, X2, length_scale=length_scale, variance=variance)
        self.noise = noise

    def fit(self, X, y):
        self.X_train = np.atleast_2d(X)
        self.y_train = np.atleast_1d(y)
        K = self.kernel(self.X_train, self.X_train) + self.noise * np.eye(len(self.X_train))
        self.L = np.linalg.cholesky(K)
        self.alpha = np.linalg.solve(self.L.T, np.linalg.solve(self.L, self.y_train))

    def predict(self, X, return_std=True):
        X = np.atleast_2d(X)
        K_trans = self.kernel(self.X_train, X)
        y_mean = K_trans.T.dot(self.alpha)
        if return_std:
            v = np.linalg.solve(self.L, K_trans)
            y_cov = self.kernel(X, X) - v.T.dot(v)
            y_std = np.sqrt(np.diag(y_cov))
            return y_mean, y_std
        return y_mean

# Expected Improvement acquisition function
def expected_improvement(mu, sigma, y_best, xi=0.01, maximize=False):
    if maximize:
        imp = mu - y_best - xi
    else:
        imp = y_best - mu - xi
    with np.errstate(divide='ignore'):
        Z = imp / sigma
        ei = imp * norm.cdf(Z) + sigma * norm.pdf(Z)
        ei[sigma == 0.0] = 0.0
    return ei

# Bayesian Optimization class
class InteractiveBayesianOptimization:
    def __init__(self, random_state=None):
        self.random_state = np.random.RandomState(random_state)
        self.gp = GaussianProcessRegressor()
        self.X = None
        self.Y = None
        self.iter_count = 0
        self.param_names = []
        self.bounds = None
        self.discrete_params = []
        self.dimensions = 0
        self.init_points = 0
        self.max_iter = 0
        self.maximize = False
        self.objective_name = ""
        self.additional_metric_name = None

    def configure(self, config_data):
        try:
            logger.debug(f"Received config_data: {config_data}")
            self.param_names = config_data['param_names']
            self.bounds = np.array(config_data['bounds'])
            self.discrete_params = config_data['discrete_params']
            self.dimensions = len(self.param_names)
            self.init_points = config_data['init_points']
            self.max_iter = config_data['max_iter']
            self.maximize = config_data['maximize']
            self.objective_name = config_data['objective_name']
            self.additional_metric_name = config_data['additional_metric_name']
            
            # Validate inputs
            if not self.param_names or len(self.param_names) == 0:
                return False, "参数名称不能为空"
            if len(self.bounds) != len(self.param_names):
                return False, "界限数量与参数数量不匹配"
            for i, (lower, upper) in enumerate(self.bounds):
                if lower >= upper:
                    return False, f"参数 {self.param_names[i]} 的下界必须小于上界"
            if self.init_points < 1:
                return False, "初始点数必须大于0"
            if self.max_iter < self.init_points:
                return False, "最大迭代次数必须大于或等于初始点数"
            logger.debug("Configuration validated successfully")
            return True, ""
        except (KeyError, ValueError) as e:
            logger.error(f"Configuration error: {str(e)}")
            return False, f"配置数据无效: {str(e)}"

    def _param_to_array(self, params):
        return np.array([params[name] for name in self.param_names])

    def _array_to_param(self, x):
        return {name: val for name, val in zip(self.param_names, x)}

    def suggest(self):
        logger.debug(f"Suggesting parameters at iteration {self.iter_count}")
        if self.Y is None or len(self.Y) < self.init_points:
            # Initial points using Latin Hypercube Sampling
            lhs = LatinHypercube(d=self.dimensions, seed=self.random_state)
            samples = lhs.random(n=1)
            samples = scale(samples, self.bounds[:, 0], self.bounds[:, 1])
            # Adjust discrete parameters
            for i, discretes in enumerate(self.discrete_params):
                if discretes:
                    samples[0, i] = min(discretes, key=lambda v: abs(v - samples[0, i]))
            return self._array_to_param(samples[0])
        else:
            # Use EI for next point
            def acq_func(x):
                x = x.reshape(1, -1)
                # Adjust discrete parameters
                for i, discretes in enumerate(self.discrete_params):
                    if discretes:
                        x[0, i] = min(discretes, key=lambda v: abs(v - x[0, i]))
                mu, sigma = self.gp.predict(x, return_std=True)
                best_y = np.max(self.Y) if self.maximize else np.min(self.Y)
                return -expected_improvement(mu, sigma, best_y, maximize=self.maximize)

            x0 = self.random_state.uniform(self.bounds[:, 0], self.bounds[:, 1])
            for i, discretes in enumerate(self.discrete_params):
                if discretes:
                    x0[i] = min(discretes, key=lambda v: abs(v - x0[i]))
            res = minimize(acq_func, x0=x0, bounds=self.bounds, method='L-BFGS-B')
            for i, discretes in enumerate(self.discrete_params):
                if discretes:
                    res.x[i] = min(discretes, key=lambda v: abs(v - res.x[i]))
            return self._array_to_param(res.x)

    def register(self, params, target):
        logger.debug(f"Registering params: {params}, target: {target}")
        x = self._param_to_array(params).reshape(1, -1)
        adjusted_target = target if self.maximize else -target
        if self.X is None:
            self.X = x
            self.Y = np.array([adjusted_target])
        else:
            self.X = np.vstack((self.X, x))
            self.Y = np.append(self.Y, adjusted_target)
        self.gp.fit(self.X, self.Y)

# Flask application
app = Flask(__name__)
CORS(app)  # Enable CORS for all routes

bo = InteractiveBayesianOptimization(random_state=42)

@app.route('/')
def index():
    return render_template('index.html')

@app.route('/configure', methods=['POST'])
def configure():
    config_data = request.json
    logger.debug(f"Received configure request: {config_data}")
    success, error = bo.configure(config_data)
    logger.debug(f"Configure response: success={success}, error={error}")
    return jsonify({'success': success, 'error': error if not success else ''})

@app.route('/suggest', methods=['GET'])
def suggest():
    params = bo.suggest()
    logger.debug(f"Suggested params: {params}")
    return jsonify(params)

@app.route('/register', methods=['POST'])
def register():
    try:
        data = request.json
        logger.debug(f"Received register request: {data}")
        
        if not data or 'params' not in data or 'objective_value' not in data:
            logger.error("Invalid data format")
            return jsonify({'success': False, 'error': '无效的数据格式', 'iter_count': bo.iter_count})
        
        params = data['params']
        objective_value = float(data['objective_value'])
        
        # Validate parameters
        for name in bo.param_names:
            if name not in params:
                logger.error(f"Missing parameter: {name}")
                return jsonify({'success': False, 'error': f'缺少参数: {name}', 'iter_count': bo.iter_count})
            try:
                float(params[name])
            except ValueError:
                logger.error(f"Invalid value for parameter {name}: {params[name]}")
                return jsonify({'success': False, 'error': f'参数 {name} 的值无效', 'iter_count': bo.iter_count})
        
        bo.register(params, objective_value)
        bo.iter_count += 1
        logger.debug(f"Registered iteration {bo.iter_count}")
        return jsonify({'success': True, 'iter_count': bo.iter_count})
        
    except Exception as e:
        logger.error(f"Error in register: {str(e)}")
        return jsonify({'success': False, 'error': str(e), 'iter_count': bo.iter_count})

@app.route('/best_result', methods=['GET'])
def best_result():
    if bo.Y is None:
        logger.error("No data available for best_result")
        return jsonify({'error': 'No data available'})
    best_idx = np.argmax(bo.Y) if bo.maximize else np.argmin(bo.Y)
    best_params = bo._array_to_param(bo.X[best_idx])
    best_objective = bo.Y[best_idx] if bo.maximize else -bo.Y[best_idx]
    logger.debug(f"Best result: params={best_params}, objective={best_objective}")
    return jsonify({
        'params': best_params,
        'objective': best_objective
    })

if __name__ == '__main__':
    app.run(host='0.0.0.0', port=5000)