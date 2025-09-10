import { useState } from 'react';
import { Settings, ArrowRight, CheckCircle, XCircle, Brain, Eye, EyeOff } from 'lucide-react';
import axios from 'axios';
import AppLayout from './AppLayout';

function SetupPage({ onComplete, onNavigate }) {
  // Date range moved to Whiteboard top bar for clarity
  const [teamMembers, setTeamMembers] = useState('');
  const [linearStatus, setLinearStatus] = useState(null);
  const [testingLinear, setTestingLinear] = useState(false);
  const [slackStatus, setSlackStatus] = useState(null);
  const [testingSlack, setTestingSlack] = useState(false);
  const [githubStatus, setGithubStatus] = useState(null);
  const [testingGithub, setTestingGithub] = useState(false);
  const [llmConfig, setLlmConfig] = useState({
    provider: '',
    apiKey: '',
    model: '',
    enabled: true,
    privacyMode: false
  });
  const [llmStatus, setLlmStatus] = useState(null);
  const [testingLlm, setTestingLlm] = useState(false);
  const [showApiKey, setShowApiKey] = useState(false);

  const handleSubmit = (e) => {
    e.preventDefault();
    onComplete({
      dateRange: undefined,
      teamMembers: teamMembers.split(',').map(m => m.trim()).filter(Boolean)
    });
  };

  const testLinearConnection = async () => {
    setTestingLinear(true);
    try {
      const response = await axios.get('http://localhost:3001/api/test-linear');
      setLinearStatus({ success: true, message: 'Linear connected successfully!', user: response.data.user });
    } catch (error) {
      setLinearStatus({ 
        success: false, 
        message: error.response?.data?.error || 'Failed to connect to Linear' 
      });
    } finally {
      setTestingLinear(false);
    }
  };

  const testSlackConnection = async () => {
    setTestingSlack(true);
    try {
      const response = await axios.get('http://localhost:3001/api/test-slack');
      setSlackStatus({ success: true, message: 'Slack connected successfully!', team: response.data.team });
    } catch (error) {
      setSlackStatus({ 
        success: false, 
        message: error.response?.data?.error || 'Failed to connect to Slack' 
      });
    } finally {
      setTestingSlack(false);
    }
  };

  const testGithubConnection = async () => {
    setTestingGithub(true);
    try {
      const response = await axios.get('http://localhost:3001/api/test-github');
      setGithubStatus({ success: true, message: 'GitHub connected successfully!', user: response.data.user });
    } catch (error) {
      setGithubStatus({ 
        success: false, 
        message: error.response?.data?.error || 'Failed to connect to GitHub' 
      });
    } finally {
      setTestingGithub(false);
    }
  };

  const testLlmConfiguration = async () => {
    setTestingLlm(true);
    try {
      if (!llmConfig.provider) {
        // Test current environment configuration
        const response = await axios.get('http://localhost:3001/api/test-llm');
        setLlmStatus({ 
          success: response.data.enabled, 
          message: response.data.message || response.data.status,
          provider: response.data.provider,
          model: response.data.model,
          configuration: response.data.configuration
        });
      } else {
        // Test specific configuration
        const testConfig = {
          provider: llmConfig.provider,
          apiKey: llmConfig.apiKey,
          model: llmConfig.model || getDefaultModel(llmConfig.provider),
          enabled: llmConfig.enabled,
          privacyMode: llmConfig.privacyMode
        };
        
        const response = await axios.post('http://localhost:3001/api/test-llm', testConfig);
        setLlmStatus({ 
          success: true, 
          message: response.data.message || response.data.status,
          provider: response.data.provider,
          model: response.data.model,
          configuration: response.data.configuration
        });
      }
    } catch (error) {
      setLlmStatus({ 
        success: false, 
        message: error.response?.data?.error || error.response?.data?.message || 'Failed to test LLM configuration',
        details: error.response?.data?.details,
        availableProviders: error.response?.data?.availableProviders
      });
    } finally {
      setTestingLlm(false);
    }
  };

  const getDefaultModel = (provider) => {
    const defaultModels = {
      'openai': 'gpt-3.5-turbo',
      'anthropic': 'claude-3-sonnet-20240229',
      'local': 'llama2'
    };
    return defaultModels[provider] || '';
  };

  const getProviderModels = (provider) => {
    const providerModels = {
      'openai': ['gpt-4', 'gpt-3.5-turbo', 'gpt-4-turbo'],
      'anthropic': ['claude-3-sonnet-20240229', 'claude-3-haiku-20240307', 'claude-3-opus-20240229'],
      'local': ['llama2', 'llama3', 'mistral', 'codellama']
    };
    return providerModels[provider] || [];
  };

  const handleLlmConfigChange = (field, value) => {
    setLlmConfig(prev => {
      const newConfig = { ...prev, [field]: value };
      
      // Auto-set default model when provider changes
      if (field === 'provider' && value) {
        newConfig.model = getDefaultModel(value);
      }
      
      return newConfig;
    });
    
    // Clear status when configuration changes
    if (llmStatus) {
      setLlmStatus(null);
    }
  };

  return (
    <AppLayout onNavigate={onNavigate}>
      <div className="max-w-3xl mx-auto">
      <div className="mb-4">
        <h1 className="text-xl font-semibold text-gray-900 dark:text-gray-100 mb-4">Integrations</h1>
        <p className="text-md text-gray-600 dark:text-gray-400">Connect your tools to power insights</p>
      </div>

      <form onSubmit={handleSubmit} className="space-y-6">

        <div className="bg-white dark:bg-gray-800 p-4 rounded-xl border border-gray-200 dark:border-gray-700">
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-lg font-semibold">Linear Integration</h2>
            <button
              type="button"
              onClick={testLinearConnection}
              disabled={testingLinear}
              className="px-3 py-1 text-sm bg-gray-900 dark:bg-gray-600 text-white rounded-md hover:bg-black dark:hover:bg-gray-500 disabled:opacity-60"
            >
              {testingLinear ? 'Testing...' : 'Test Connection'}
            </button>
          </div>
          
          {linearStatus && (
            <div className={`flex items-center gap-2 p-3 rounded-md mb-4 ${
              linearStatus.success ? 'bg-green-50 dark:bg-green-900/20 text-green-800 dark:text-green-300' : 'bg-red-50 dark:bg-red-900/20 text-red-800 dark:text-red-300'
            }`}>
              {linearStatus.success ? (
                <CheckCircle className="w-4 h-4" />
              ) : (
                <XCircle className="w-4 h-4" />
              )}
              <span className="text-sm">{linearStatus.message}</span>
              {linearStatus.user && (
                <span className="text-xs opacity-75 dark:opacity-60">({linearStatus.user.name})</span>
              )}
            </div>
          )}
          
          <p className="text-sm text-gray-600 dark:text-gray-400">
            Make sure your LINEAR_API_KEY is configured in server/.env
          </p>
        </div>

        <div className="bg-white dark:bg-gray-800 p-4 rounded-xl border border-gray-200 dark:border-gray-700">
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-lg font-semibold">Slack Integration</h2>
            <button
              type="button"
              onClick={testSlackConnection}
              disabled={testingSlack}
              className="px-3 py-1 text-sm bg-gray-900 dark:bg-gray-600 text-white rounded-md hover:bg-black dark:hover:bg-gray-500 disabled:opacity-60"
            >
              {testingSlack ? 'Testing...' : 'Test Connection'}
            </button>
          </div>
          
          {slackStatus && (
            <div className={`flex items-center gap-2 p-3 rounded-md mb-4 ${
              slackStatus.success ? 'bg-green-50 dark:bg-green-900/20 text-green-800 dark:text-green-300' : 'bg-red-50 dark:bg-red-900/20 text-red-800 dark:text-red-300'
            }`}>
              {slackStatus.success ? (
                <CheckCircle className="w-4 h-4" />
              ) : (
                <XCircle className="w-4 h-4" />
              )}
              <span className="text-sm">{slackStatus.message}</span>
              {slackStatus.team && (
                <span className="text-xs opacity-75 dark:opacity-60">({slackStatus.team})</span>
              )}
            </div>
          )}
          
          <p className="text-sm text-gray-600 dark:text-gray-400">
            Make sure your SLACK_BOT_TOKEN is configured in server/.env (optional)
          </p>
        </div>

        <div className="bg-white dark:bg-gray-800 p-4 rounded-xl border border-gray-200 dark:border-gray-700">
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-lg font-semibold">GitHub Integration</h2>
            <button
              type="button"
              onClick={testGithubConnection}
              disabled={testingGithub}
              className="px-3 py-1 text-sm bg-gray-900 dark:bg-gray-600 text-white rounded-md hover:bg-black dark:hover:bg-gray-500 disabled:opacity-60"
            >
              {testingGithub ? 'Testing...' : 'Test Connection'}
            </button>
          </div>
          
          {githubStatus && (
            <div className={`flex items-center gap-2 p-3 rounded-md mb-4 ${
              githubStatus.success ? 'bg-green-50 dark:bg-green-900/20 text-green-800 dark:text-green-300' : 'bg-red-50 dark:bg-red-900/20 text-red-800 dark:text-red-300'
            }`}>
              {githubStatus.success ? (
                <CheckCircle className="w-4 h-4" />
              ) : (
                <XCircle className="w-4 h-4" />
              )}
              <span className="text-sm">{githubStatus.message}</span>
              {githubStatus.user && (
                <span className="text-xs opacity-75 dark:opacity-60">(@{githubStatus.user})</span>
              )}
            </div>
          )}
          
          <p className="text-sm text-gray-600 dark:text-gray-400">
            Make sure your GITHUB_TOKEN is configured in server/.env (optional)
          </p>
        </div>

        <div className="bg-white dark:bg-gray-800 p-4 rounded-xl border border-gray-200 dark:border-gray-700">
          <div className="flex items-center justify-between mb-4">
            <div className="flex items-center gap-2">
              <Brain className="w-5 h-5 text-purple-600" />
              <h2 className="text-lg font-semibold">AI Analysis (Optional)</h2>
            </div>
            <button
              type="button"
              onClick={testLlmConfiguration}
              disabled={testingLlm}
              className="px-3 py-1 text-sm bg-purple-100 text-purple-700 rounded-md hover:bg-purple-200 disabled:opacity-50"
            >
              {testingLlm ? 'Testing...' : 'Test Configuration'}
            </button>
          </div>
          
          {llmStatus && (
            <div className={`flex items-center gap-2 p-3 rounded-md mb-4 ${
              llmStatus.success ? 'bg-green-50 dark:bg-green-900/20 text-green-800 dark:text-green-300' : 'bg-red-50 dark:bg-red-900/20 text-red-800 dark:text-red-300'
            }`}>
              {llmStatus.success ? (
                <CheckCircle className="w-4 h-4" />
              ) : (
                <XCircle className="w-4 h-4" />
              )}
              <div className="flex-1">
                <span className="text-sm">{llmStatus.message}</span>
                {llmStatus.provider && llmStatus.model && (
                  <span className="text-xs opacity-75 dark:opacity-60 block">
                    Provider: {llmStatus.provider}, Model: {llmStatus.model}
                  </span>
                )}
                {llmStatus.details && (
                  <span className="text-xs opacity-75 dark:opacity-60 block">
                    {llmStatus.details}
                  </span>
                )}
              </div>
            </div>
          )}

          <div className="space-y-4">
            <div>
              <label htmlFor="llm-provider" className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                AI Provider
              </label>
              <select
                id="llm-provider"
                value={llmConfig.provider}
                onChange={(e) => handleLlmConfigChange('provider', e.target.value)}
                className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-md bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100 focus:outline-none focus:ring-2 focus:ring-purple-500 dark:focus:ring-purple-400"
              >
                <option value="">Disabled (Rule-based analysis only)</option>
                <option value="openai">OpenAI (GPT-4, GPT-3.5)</option>
                <option value="anthropic">Anthropic (Claude)</option>
                <option value="local">Local Model (Ollama)</option>
              </select>
            </div>

            {llmConfig.provider && llmConfig.provider !== 'local' && (
              <div>
                <label htmlFor="llm-api-key" className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                  API Key
                </label>
                <div className="relative">
                  <input
                    id="llm-api-key"
                    type={showApiKey ? 'text' : 'password'}
                    value={llmConfig.apiKey}
                    onChange={(e) => handleLlmConfigChange('apiKey', e.target.value)}
                    placeholder={`Enter your ${llmConfig.provider.toUpperCase()} API key`}
                    className="w-full px-3 py-2 pr-10 border border-gray-300 dark:border-gray-600 rounded-md bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100 focus:outline-none focus:ring-2 focus:ring-purple-500 dark:focus:ring-purple-400"
                  />
                  <button
                    type="button"
                    onClick={() => setShowApiKey(!showApiKey)}
                    aria-label={showApiKey ? 'Hide API key' : 'Show API key'}
                    className="absolute right-2 top-1/2 transform -translate-y-1/2 text-gray-400 dark:text-gray-500 hover:text-gray-600 dark:hover:text-gray-300"
                  >
                    {showApiKey ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                  </button>
                </div>
              </div>
            )}

            {llmConfig.provider && (
              <div>
                <label htmlFor="llm-model" className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                  Model
                </label>
                <select
                  id="llm-model"
                  value={llmConfig.model}
                  onChange={(e) => handleLlmConfigChange('model', e.target.value)}
                  className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-md bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100 focus:outline-none focus:ring-2 focus:ring-purple-500 dark:focus:ring-purple-400"
                >
                  {getProviderModels(llmConfig.provider).map(model => (
                    <option key={model} value={model}>{model}</option>
                  ))}
                </select>
              </div>
            )}

            {llmConfig.provider && (
              <div className="flex items-center gap-4">
                <label htmlFor="llm-privacy-mode" className="flex items-center gap-2">
                  <input
                    id="llm-privacy-mode"
                    type="checkbox"
                    checked={llmConfig.privacyMode}
                    onChange={(e) => handleLlmConfigChange('privacyMode', e.target.checked)}
                    className="rounded border-gray-300 dark:border-gray-600 text-gray-900 dark:text-gray-100 focus:ring-gray-700 dark:focus:ring-gray-400"
                  />
                  <span className="text-sm text-gray-700 dark:text-gray-300">Privacy Mode</span>
                </label>
              </div>
            )}
          </div>

          <div className="mt-4 p-3 bg-gray-50 dark:bg-gray-700 rounded-md">
            <p className="text-sm text-gray-600 dark:text-gray-400">
              {llmConfig.provider ? (
                llmConfig.provider === 'local' ? (
                  'Local models keep your data private and don\'t require API keys. Make sure Ollama is running locally.'
                ) : llmConfig.privacyMode ? (
                  'Privacy mode enabled: Data will be sanitized before sending to external AI services.'
                ) : (
                  'AI analysis will send team data to external services for enhanced insights. Enable privacy mode to sanitize sensitive information.'
                )
              ) : (
                'AI analysis is disabled. Only rule-based insights will be generated from your team data.'
              )}
            </p>
          </div>
        </div>

        <div className="bg-white dark:bg-gray-800 p-4 rounded-xl border border-gray-200 dark:border-gray-700">
          <h2 className="text-lg font-semibold text-gray-900 dark:text-gray-100 mb-4">Team Members</h2>
          <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
            Team Members (comma-separated)
          </label>
          <input
            type="text"
            value={teamMembers}
            onChange={(e) => setTeamMembers(e.target.value)}
            placeholder="john.doe, jane.smith, alex.wilson"
            className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-md bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100 focus:outline-none focus:ring-2 focus:ring-blue-500 dark:focus:ring-blue-400"
          />
          <p className="text-sm text-gray-500 dark:text-gray-400 mt-2">
            Leave empty to include all team members
          </p>
        </div>

        <button
          type="submit"
          className="w-full bg-gray-900 dark:bg-gray-600 text-white py-3 px-4 rounded-md hover:bg-black dark:hover:bg-gray-500 transition-colors flex items-center justify-center gap-2"
        >
          Continue
          <ArrowRight className="w-4 h-4" />
        </button>
      </form>
      </div>
    </AppLayout>
  );
}

export default SetupPage;