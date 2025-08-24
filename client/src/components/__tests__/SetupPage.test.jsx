import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import axios from 'axios';
import SetupPage from '../SetupPage';

// Mock axios
vi.mock('axios');
const mockedAxios = vi.mocked(axios);

describe('SetupPage LLM Configuration', () => {
  const mockOnComplete = vi.fn();

  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterEach(() => {
    vi.resetAllMocks();
  });

  it('renders LLM configuration section', () => {
    render(<SetupPage onComplete={mockOnComplete} />);
    
    expect(screen.getByText('AI Analysis (Optional)')).toBeInTheDocument();
    expect(screen.getByText('Test Configuration')).toBeInTheDocument();
    expect(screen.getByLabelText('AI Provider')).toBeInTheDocument();
  });

  it('shows provider options in dropdown', () => {
    render(<SetupPage onComplete={mockOnComplete} />);
    
    const providerSelect = screen.getByLabelText('AI Provider');
    expect(providerSelect).toBeInTheDocument();
    
    // Check all provider options are present
    expect(screen.getByText('Disabled (Rule-based analysis only)')).toBeInTheDocument();
    expect(screen.getByText('OpenAI (GPT-4, GPT-3.5)')).toBeInTheDocument();
    expect(screen.getByText('Anthropic (Claude)')).toBeInTheDocument();
    expect(screen.getByText('Local Model (Ollama)')).toBeInTheDocument();
  });

  it('shows API key field when external provider is selected', async () => {
    render(<SetupPage onComplete={mockOnComplete} />);
    
    const providerSelect = screen.getByLabelText('AI Provider');
    
    // Select OpenAI
    fireEvent.change(providerSelect, { target: { value: 'openai' } });
    
    await waitFor(() => {
      expect(screen.getByLabelText('API Key')).toBeInTheDocument();
      expect(screen.getByPlaceholderText('Enter your OPENAI API key')).toBeInTheDocument();
    });
  });

  it('does not show API key field for local provider', async () => {
    render(<SetupPage onComplete={mockOnComplete} />);
    
    const providerSelect = screen.getByLabelText('AI Provider');
    
    // Select local
    fireEvent.change(providerSelect, { target: { value: 'local' } });
    
    await waitFor(() => {
      expect(screen.queryByLabelText('API Key')).not.toBeInTheDocument();
    });
  });

  it('shows model selection when provider is selected', async () => {
    render(<SetupPage onComplete={mockOnComplete} />);
    
    const providerSelect = screen.getByLabelText('AI Provider');
    
    // Select OpenAI
    fireEvent.change(providerSelect, { target: { value: 'openai' } });
    
    await waitFor(() => {
      expect(screen.getByLabelText('Model')).toBeInTheDocument();
      expect(screen.getByDisplayValue('gpt-3.5-turbo')).toBeInTheDocument();
    });
  });

  it('updates model options based on provider selection', async () => {
    render(<SetupPage onComplete={mockOnComplete} />);
    
    const providerSelect = screen.getByLabelText('AI Provider');
    
    // Select OpenAI
    fireEvent.change(providerSelect, { target: { value: 'openai' } });
    
    await waitFor(() => {
      const modelSelect = screen.getByLabelText('Model');
      expect(modelSelect).toBeInTheDocument();
      
      // Check OpenAI models are present
      expect(screen.getByText('gpt-4')).toBeInTheDocument();
      expect(screen.getByText('gpt-3.5-turbo')).toBeInTheDocument();
      expect(screen.getByText('gpt-4-turbo')).toBeInTheDocument();
    });

    // Switch to Anthropic
    fireEvent.change(providerSelect, { target: { value: 'anthropic' } });
    
    await waitFor(() => {
      // Check Anthropic models are present
      expect(screen.getByText('claude-3-sonnet-20240229')).toBeInTheDocument();
      expect(screen.getByText('claude-3-haiku-20240307')).toBeInTheDocument();
      expect(screen.getByText('claude-3-opus-20240229')).toBeInTheDocument();
    });
  });

  it('shows privacy mode checkbox when provider is selected', async () => {
    render(<SetupPage onComplete={mockOnComplete} />);
    
    const providerSelect = screen.getByLabelText('AI Provider');
    
    // Select OpenAI
    fireEvent.change(providerSelect, { target: { value: 'openai' } });
    
    await waitFor(() => {
      expect(screen.getByLabelText('Privacy Mode')).toBeInTheDocument();
    });
  });

  it('toggles API key visibility', async () => {
    render(<SetupPage onComplete={mockOnComplete} />);
    
    const providerSelect = screen.getByLabelText('AI Provider');
    fireEvent.change(providerSelect, { target: { value: 'openai' } });
    
    await waitFor(() => {
      const apiKeyInput = screen.getByLabelText('API Key');
      const toggleButton = screen.getByLabelText('Show API key');
      
      // Initially should be password type
      expect(apiKeyInput.type).toBe('password');
      
      // Click to show
      fireEvent.click(toggleButton);
      expect(apiKeyInput.type).toBe('text');
      
      // Click to hide
      fireEvent.click(toggleButton);
      expect(apiKeyInput.type).toBe('password');
    });
  });

  it('displays appropriate privacy message based on configuration', async () => {
    render(<SetupPage onComplete={mockOnComplete} />);
    
    // Initially disabled
    expect(screen.getByText(/AI analysis is disabled/)).toBeInTheDocument();
    
    const providerSelect = screen.getByLabelText('AI Provider');
    
    // Select external provider
    fireEvent.change(providerSelect, { target: { value: 'openai' } });
    
    await waitFor(() => {
      expect(screen.getByText(/AI analysis will send team data to external services/)).toBeInTheDocument();
    });
    
    // Enable privacy mode
    const privacyCheckbox = screen.getByLabelText('Privacy Mode');
    fireEvent.click(privacyCheckbox);
    
    await waitFor(() => {
      expect(screen.getByText(/Privacy mode enabled: Data will be sanitized/)).toBeInTheDocument();
    });
    
    // Select local provider
    fireEvent.change(providerSelect, { target: { value: 'local' } });
    
    await waitFor(() => {
      expect(screen.getByText(/Local models keep your data private/)).toBeInTheDocument();
    });
  });

  describe('LLM Configuration Testing', () => {
    it('tests current environment configuration when no provider selected', async () => {
      const mockResponse = {
        data: {
          enabled: true,
          status: 'LLM connection successful!',
          provider: 'openai',
          model: 'gpt-3.5-turbo',
          configuration: { configured: true }
        }
      };
      
      mockedAxios.get.mockResolvedValueOnce(mockResponse);
      
      render(<SetupPage onComplete={mockOnComplete} />);
      
      const testButton = screen.getByText('Test Configuration');
      fireEvent.click(testButton);
      
      expect(testButton).toHaveTextContent('Testing...');
      
      await waitFor(() => {
        expect(mockedAxios.get).toHaveBeenCalledWith('http://localhost:3001/api/test-llm');
        expect(screen.getByText('LLM connection successful!')).toBeInTheDocument();
        expect(screen.getByText('Provider: openai, Model: gpt-3.5-turbo')).toBeInTheDocument();
      });
    });

    it('tests specific configuration when provider is selected', async () => {
      const mockResponse = {
        data: {
          status: 'Provider test successful!',
          provider: 'openai',
          model: 'gpt-4',
          configuration: { valid: true }
        }
      };
      
      mockedAxios.post.mockResolvedValueOnce(mockResponse);
      
      render(<SetupPage onComplete={mockOnComplete} />);
      
      // Configure LLM
      const providerSelect = screen.getByLabelText('AI Provider');
      fireEvent.change(providerSelect, { target: { value: 'openai' } });
      
      await waitFor(() => {
        const apiKeyInput = screen.getByLabelText('API Key');
        fireEvent.change(apiKeyInput, { target: { value: 'test-api-key' } });
        
        const modelSelect = screen.getByLabelText('Model');
        fireEvent.change(modelSelect, { target: { value: 'gpt-4' } });
      });
      
      const testButton = screen.getByText('Test Configuration');
      fireEvent.click(testButton);
      
      await waitFor(() => {
        expect(mockedAxios.post).toHaveBeenCalledWith('http://localhost:3001/api/test-llm', {
          provider: 'openai',
          apiKey: 'test-api-key',
          model: 'gpt-4',
          enabled: true,
          privacyMode: false
        });
        expect(screen.getByText('Provider test successful!')).toBeInTheDocument();
      });
    });

    it('handles test configuration errors', async () => {
      const mockError = {
        response: {
          data: {
            error: 'Invalid API key',
            details: 'The provided API key is not valid',
            availableProviders: ['openai', 'anthropic', 'local']
          }
        }
      };
      
      mockedAxios.post.mockRejectedValueOnce(mockError);
      
      render(<SetupPage onComplete={mockOnComplete} />);
      
      // Configure LLM
      const providerSelect = screen.getByLabelText('AI Provider');
      fireEvent.change(providerSelect, { target: { value: 'openai' } });
      
      await waitFor(() => {
        const apiKeyInput = screen.getByLabelText('API Key');
        fireEvent.change(apiKeyInput, { target: { value: 'invalid-key' } });
      });
      
      const testButton = screen.getByText('Test Configuration');
      fireEvent.click(testButton);
      
      await waitFor(() => {
        expect(screen.getByText('Invalid API key')).toBeInTheDocument();
        expect(screen.getByText('The provided API key is not valid')).toBeInTheDocument();
      });
    });

    it('clears status when configuration changes', async () => {
      const mockResponse = {
        data: {
          status: 'Provider test successful!',
          provider: 'openai',
          model: 'gpt-4'
        }
      };
      
      mockedAxios.post.mockResolvedValueOnce(mockResponse);
      
      render(<SetupPage onComplete={mockOnComplete} />);
      
      // Configure and test LLM
      const providerSelect = screen.getByLabelText('AI Provider');
      fireEvent.change(providerSelect, { target: { value: 'openai' } });
      
      await waitFor(() => {
        const testButton = screen.getByText('Test Configuration');
        fireEvent.click(testButton);
      });
      
      await waitFor(() => {
        expect(screen.getByText('Provider test successful!')).toBeInTheDocument();
      });
      
      // Change configuration
      fireEvent.change(providerSelect, { target: { value: 'anthropic' } });
      
      await waitFor(() => {
        expect(screen.queryByText('Provider test successful!')).not.toBeInTheDocument();
      });
    });

    it('handles network errors gracefully', async () => {
      mockedAxios.get.mockRejectedValueOnce(new Error('Network error'));
      
      render(<SetupPage onComplete={mockOnComplete} />);
      
      const testButton = screen.getByText('Test Configuration');
      fireEvent.click(testButton);
      
      await waitFor(() => {
        expect(screen.getByText('Failed to test LLM configuration')).toBeInTheDocument();
      });
    });
  });

  describe('Form Integration', () => {
    it('includes LLM configuration in form submission', async () => {
      render(<SetupPage onComplete={mockOnComplete} />);
      
      // Configure LLM
      const providerSelect = screen.getByLabelText('AI Provider');
      fireEvent.change(providerSelect, { target: { value: 'openai' } });
      
      await waitFor(() => {
        const apiKeyInput = screen.getByLabelText('API Key');
        fireEvent.change(apiKeyInput, { target: { value: 'test-key' } });
        
        const privacyCheckbox = screen.getByLabelText('Privacy Mode');
        fireEvent.click(privacyCheckbox);
      });
      
      // Submit form
      const submitButton = screen.getByText('Continue to Generate');
      fireEvent.click(submitButton);
      
      expect(mockOnComplete).toHaveBeenCalledWith({
        dateRange: expect.any(Object),
        teamMembers: []
      });
    });

    it('works without LLM configuration', () => {
      render(<SetupPage onComplete={mockOnComplete} />);
      
      // Submit form without configuring LLM
      const submitButton = screen.getByText('Continue to Generate');
      fireEvent.click(submitButton);
      
      expect(mockOnComplete).toHaveBeenCalledWith({
        dateRange: expect.any(Object),
        teamMembers: []
      });
    });
  });
});