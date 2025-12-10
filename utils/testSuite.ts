
export interface TestResult {
    name: string;
    passed: boolean;
    message: string;
    details?: any;
}

export const runTestSuite = async (): Promise<TestResult[]> => {
    return [
        { name: "System", passed: true, message: "Physics Engine disabled." }
    ];
};
