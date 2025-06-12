// src/testing/testDetector.ts
import * as vscode from 'vscode';
import * as fs from 'fs';
import * as path from 'path';

export interface TestCase {
    name: string;
    className: string;
    filePath: string;
    line: number;
    type: 'method' | 'class';
}

export interface ProjectTestInfo {
    projectType: 'java' | 'python' | 'javascript' | 'angular' | 'unknown';
    testFramework: string;
    testCases: TestCase[];
    hasTests: boolean;
    configFile?: string;
}

export abstract class TestDetector {
    abstract detectProjectType(workspacePath: string): Promise<boolean>;
    abstract findTestCases(workspacePath: string): Promise<TestCase[]>;
    abstract getTestFramework(): string;
    abstract getRunAllCommand(): string;
    abstract getRunSingleTestCommand(testCase: TestCase): string;
    abstract getRunClassCommand(className: string): string;
}

// Java Maven Test Detector
export class JavaMavenTestDetector extends TestDetector {
    async detectProjectType(workspacePath: string): Promise<boolean> {
        const pomPath = path.join(workspacePath, 'pom.xml');
        return fs.existsSync(pomPath);
    }

    async findTestCases(workspacePath: string): Promise<TestCase[]> {
        const testCases: TestCase[] = [];
        const testDir = path.join(workspacePath, 'src', 'test', 'java');
        
        if (!fs.existsSync(testDir)) {
            return testCases;
        }

        await this.scanDirectory(testDir, testCases);
        return testCases;
    }

    private async scanDirectory(dirPath: string, testCases: TestCase[]): Promise<void> {
        const entries = fs.readdirSync(dirPath, { withFileTypes: true });
        
        for (const entry of entries) {
            const fullPath = path.join(dirPath, entry.name);
            
            if (entry.isDirectory()) {
                await this.scanDirectory(fullPath, testCases);
            } else if (entry.isFile() && entry.name.endsWith('.java')) {
                await this.parseJavaTestFile(fullPath, testCases);
            }
        }
    }

    private async parseJavaTestFile(filePath: string, testCases: TestCase[]): Promise<void> {
        try {
            const content = fs.readFileSync(filePath, 'utf8');
            const lines = content.split('\n');
            
            let className = '';
            let packageName = '';
            
            // Extract package and class name
            for (let i = 0; i < lines.length; i++) {
                const line = lines[i].trim();
                
                if (line.startsWith('package ')) {
                    packageName = line.replace('package ', '').replace(';', '').trim();
                }
                
                if (line.includes('class ') && (line.includes('Test') || this.hasTestAnnotations(content))) {
                    const classMatch = line.match(/class\s+(\w+)/);
                    if (classMatch) {
                        className = packageName ? `${packageName}.${classMatch[1]}` : classMatch[1];
                        
                        // Add the test class itself
                        testCases.push({
                            name: classMatch[1],
                            className: className,
                            filePath: filePath,
                            line: i + 1,
                            type: 'class'
                        });
                    }
                }
                
                // Look for test methods
                if (this.isTestMethod(line, i > 0 ? lines[i - 1] : '')) {
                    const methodMatch = line.match(/(?:public|private|protected)?\s*(?:static\s+)?(?:void\s+)?(\w+)\s*\(/);
                    if (methodMatch && className) {
                        testCases.push({
                            name: methodMatch[1],
                            className: className,
                            filePath: filePath,
                            line: i + 1,
                            type: 'method'
                        });
                    }
                }
            }
        } catch (error) {
            console.error(`Error parsing test file ${filePath}:`, error);
        }
    }

    private hasTestAnnotations(content: string): boolean {
        return content.includes('@Test') || 
               content.includes('@TestCase') || 
               content.includes('@TestMethod') ||
               content.includes('extends TestCase') ||
               content.includes('import org.junit');
    }

    private isTestMethod(currentLine: string, previousLine: string): boolean {
        const line = currentLine.trim();
        const prevLine = previousLine.trim();
        
        // Check for @Test annotation on previous line
        if (prevLine.includes('@Test')) {
            return true;
        }
        
        // Check for test method naming convention
        if (line.includes('void test') || line.includes('void should') || line.includes('void when')) {
            return true;
        }
        
        // Check for @Test annotation on same line
        if (line.includes('@Test')) {
            return true;
        }
        
        return false;
    }

    getTestFramework(): string {
        return 'Maven/JUnit';
    }

    getRunAllCommand(): string {
        return 'mvn test';
    }

    getRunSingleTestCommand(testCase: TestCase): string {
        if (testCase.type === 'method') {
            return `mvn test -Dtest=${testCase.className}#${testCase.name}`;
        } else {
            return `mvn test -Dtest=${testCase.className}`;
        }
    }

    getRunClassCommand(className: string): string {
        return `mvn test -Dtest=${className}`;
    }
}

// Future detectors can be added here:
// export class PythonTestDetector extends TestDetector { ... }
// export class JavaScriptTestDetector extends TestDetector { ... }
// export class AngularTestDetector extends TestDetector { ... }

export class TestDetectorService {
    private detectors: TestDetector[] = [
        new JavaMavenTestDetector(),
        // Add other detectors here as they're implemented
    ];

    async detectProjectTests(workspacePath: string): Promise<ProjectTestInfo> {
        for (const detector of this.detectors) {
            if (await detector.detectProjectType(workspacePath)) {
                const testCases = await detector.findTestCases(workspacePath);
                
                let projectType: ProjectTestInfo['projectType'] = 'unknown';
                if (detector instanceof JavaMavenTestDetector) {
                    projectType = 'java';
                }
                
                return {
                    projectType,
                    testFramework: detector.getTestFramework(),
                    testCases,
                    hasTests: testCases.length > 0,
                    configFile: projectType === 'java' ? 'pom.xml' : undefined
                };
            }
        }

        return {
            projectType: 'unknown',
            testFramework: 'None',
            testCases: [],
            hasTests: false
        };
    }

    getDetectorForProject(projectType: string): TestDetector | undefined {
        switch (projectType) {
            case 'java':
                return new JavaMavenTestDetector();
            default:
                return undefined;
        }
    }
}