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
    private extensionPath: string = '';
    private prompts: {
        improve?: string;
        check?: string;
        test?: string;
    } = {};

    constructor(apiKey: string) {
        this.apiKey = apiKey;
    }

    /**
     * Load all system prompts from the resources folder
     */
    public loadSystemPrompts(extensionPath: string): void {
        this.extensionPath = extensionPath;
        
        // Load all three prompt files
        this.prompts.improve = this.loadPromptFile('improve-my-code.txt');
        this.prompts.check = this.loadPromptFile('check-my-code.txt');
        this.prompts.test = this.loadPromptFile('suggest-test-cases.txt');
    }

    /**
     * Helper method to load a specific prompt file
     */
    private loadPromptFile(filename: string): string {
        try {
            // Use path.join to properly construct the path
            const promptPath = path.join(this.extensionPath, 'resources', filename);
            console.log(`Loading prompt from: ${promptPath}`); // Debug log
            return fs.readFileSync(promptPath, 'utf8').trim();
        } catch (error) {
            console.error(`Error loading prompt file ${filename}:`, error);
            
            // Fallback prompts if files don't exist
            const fallbackPrompts: { [key: string]: string } = {
                'improve-my-code.txt': 'You are an expert software engineer. Analyze the provided code and suggest specific improvements for better performance, readability, maintainability, and best practices. Provide concrete examples and explanations.',
                'check-my-code.txt': 'You are a code reviewer and quality assurance expert. Review the provided code for potential bugs, security issues, performance problems, and violations of best practices. Highlight specific issues with line references when possible.',
                'suggest-test-cases.txt': 'You are a testing expert. Analyze the provided code and suggest comprehensive test cases including unit tests, integration tests, edge cases, and error scenarios. Provide specific test examples with appropriate testing frameworks.'
            };
            
            return fallbackPrompts[filename] || 'You are a helpful coding assistant.';
        }
    }

    /**
     * Improve code using the improve-my-code prompt
     */
    public async improveMyCode(code: string): Promise<string> {
        if (!this.prompts.improve) {
            throw new Error('Improve prompt not loaded. Call loadSystemPrompts() first.');
        }

        const messages: OpenAIMessage[] = [
            {
                role: 'system',
                content: this.prompts.improve
            },
            {
                role: 'user',
                content: `Please analyze this code and suggest improvements:\n\n\`\`\`\n${code}\n\`\`\``
            }
        ];

        const response = await this.callOpenAI(messages);
        return response.choices[0]?.message?.content || 'No response received';
    }

    /**
     * Check code for issues using the check-my-code prompt
     */
    public async checkMyCode(code: string): Promise<string> {
        if (!this.prompts.check) {
            throw new Error('Check prompt not loaded. Call loadSystemPrompts() first.');
        }

        const messages: OpenAIMessage[] = [
            {
                role: 'system',
                content: this.prompts.check
            },
            {
                role: 'user',
                content: `Please review this code for potential issues:\n\n\`\`\`\n${code}\n\`\`\``
            }
        ];

        const response = await this.callOpenAI(messages);
        return response.choices[0]?.message?.content || 'No response received';
    }

    /**
     * Suggest test cases using the suggest-test-cases prompt
     */
    public async suggestTestCases(code: string): Promise<string> {
        if (!this.prompts.test) {
            throw new Error('Test prompt not loaded. Call loadSystemPrompts() first.');
        }

        const messages: OpenAIMessage[] = [
            {
                role: 'system',
                content: this.prompts.test
            },
            {
                role: 'user',
                content: `Please suggest test cases for this code:\n\n\`\`\`\n${code}\n\`\`\``
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

        // const response = await fetch(`${runnerConfig.monolithUrl}/v1/chat/completions`, {
        const response = await fetch(`https://api.openai.com/v1/chat/completions`, {
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