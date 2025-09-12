import { useState } from 'react';
import { Settings, ArrowRight, CheckCircle, XCircle, Brain, Eye, EyeOff } from 'lucide-react';
import axios from 'axios';
import AppLayout from './AppLayout';

function SetupPage({ onComplete, onNavigate }) {
  // Date range moved to Whiteboard top bar for clarity
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
      teamMembers: []
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
            <h2 className="text-lg font-semibold text-gray-900 dark:text-gray-100">Linear Integration</h2>
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
            <h2 className="text-lg font-semibold text-gray-900 dark:text-gray-100">Slack Integration</h2>
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
          
          <div className="space-y-3">
            <p className="text-sm text-gray-600 dark:text-gray-400">
              Analyze team communication patterns and sentiment from your Slack workspace.
            </p>
            
            <div className="bg-blue-50 dark:bg-blue-900/20 p-3 rounded-md">
              <h4 className="text-sm font-medium text-blue-900 dark:text-blue-300 mb-2">Quick Setup:</h4>
              <ol className="text-sm text-blue-800 dark:text-blue-400 space-y-1 list-decimal list-inside">
                <li>
                  <a 
                    href="https://api.slack.com/apps" 
                    target="_blank" 
                    rel="noopener noreferrer"
                    className="underline hover:text-blue-600 dark:hover:text-blue-300"
                  >
                    Create a Slack App
                  </a> and get a Bot User OAuth Token
                </li>
                <li>Add the token to server/.env as SLACK_BOT_TOKEN</li>
                <li>Invite the bot to channels you want analyzed (e.g., #general, #engineering)</li>
              </ol>
            </div>
            
            <div className="text-xs text-gray-500 dark:text-gray-400 space-y-1">
              <p><strong>Privacy:</strong> Bot only accesses channels it's invited to</p>
              <p><strong>Analyzes:</strong> Message sentiment, communication patterns, team activity</p>
              <p><strong>Note:</strong> This integration is optional but provides valuable team insights</p>
            </div>
          </div>
        </div>

        <div className="bg-white dark:bg-gray-800 p-4 rounded-xl border border-gray-200 dark:border-gray-700">
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-lg font-semibold text-gray-900 dark:text-gray-100">GitHub Integration</h2>
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
            <h2 className="text-lg font-semibold text-gray-900 dark:text-gray-100">OpenAI Integration</h2>
            <button
              type="button"
              onClick={testLlmConfiguration}
              disabled={testingLlm}
              className="px-3 py-1 text-sm bg-gray-900 dark:bg-gray-600 text-white rounded-md hover:bg-black dark:hover:bg-gray-500 disabled:opacity-60"
            >
              {testingLlm ? 'Testing...' : 'Test Connection'}
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
              <span className="text-sm">{llmStatus.message}</span>
              {llmStatus.provider && llmStatus.model && (
                <span className="text-xs opacity-75 dark:opacity-60">({llmStatus.model})</span>
              )}
            </div>
          )}
          
          <div className="mb-4">
            <p className="text-sm text-gray-600 dark:text-gray-400 mb-3">
              Connect your OpenAI API key to power AI-driven retrospective insights with GPT-5.
            </p>
            
            <div className="relative">
              <input
                type={showApiKey ? 'text' : 'password'}
                placeholder="Enter your OpenAI API key (sk-...)"
                className="w-full px-3 py-2 pr-10 border border-gray-300 dark:border-gray-600 rounded-md bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100 focus:outline-none focus:ring-2 focus:ring-green-500 dark:focus:ring-green-400"
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
          
          <p className="text-sm text-gray-600 dark:text-gray-400">
            Make sure your OPENAI_API_KEY is configured in server/.env
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