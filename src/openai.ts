import * as fs from 'fs';
import * as path from 'path';
import { runnerConfig } from './data';

// OpenAI API interfaces
export interface OpenAIMessage {
    role: 'user' | 'assistant' | 'system';
    content: string;
}

export interface OpenAIResponse {
    choices: Array<{
        message: {
            content: string;
        };
    }>;
}

export class OpenAIService {
    private apiKey: string;
    private systemPrompt: string | null = null;

    constructor(apiKey: string) {
        this.apiKey = apiKey;
    }

    /**
     * Load the system prompt from the resources folder
     */
    public loadSystemPrompt(extensionUri: string): void {
        try {
            const promptPath = path.join(extensionUri, 'resources', 'analyze-prompt.txt');
            this.systemPrompt = fs.readFileSync(promptPath, 'utf8').trim();
        } catch (error) {
            console.error('Error loading system prompt:', error);
            // Fallback prompt if file doesn't exist
            this.systemPrompt = 'You are a helpful coding assistant. Analyze the provided code and provide insights, suggestions for improvement, potential issues, and explanations of what the code does.';
        }
    }

    /**
     * Analyze code using OpenAI API
     */
    public async analyzeCode(code: string): Promise<string> {
        if (!this.systemPrompt) {
            throw new Error('System prompt not loaded. Call loadSystemPrompt() first.');
        }

        const messages: OpenAIMessage[] = [
            {
                role: 'system',
                content: this.systemPrompt
            },
            {
                role: 'user',
                content: `Please analyze this code:\n\n${code}`
            }
        ];

        const response = await this.callOpenAI(messages);
        return response.choices[0]?.message?.content || 'No response received';
    }

    /**
     * Make the actual API call to OpenAI
     */
    private async callOpenAI(messages: OpenAIMessage[]): Promise<OpenAIResponse> {
        const requestBody = {
            model: 'gpt-3.5-turbo',
            messages: messages,
            max_tokens: 1500,
            temperature: 0.7
        };

        const response = await fetch('https://api.openai.com/v1/chat/completions', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${runnerConfig.oaiKey}`
            },
            body: JSON.stringify(requestBody)
        });

        if (!response.ok) {
            const errorData = await response.text();
            throw new Error(`OpenAI API request failed: ${response.status} - ${errorData}`);
        }

        return await response.json();
    }
}