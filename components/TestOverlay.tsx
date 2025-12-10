import React, { useState } from 'react';
import { runTestSuite, TestResult } from '../utils/testSuite';

const TestOverlay: React.FC<{ onClose: () => void }> = ({ onClose }) => {
    const [results, setResults] = useState<TestResult[] | null>(null);
    const [running, setRunning] = useState(false);

    const run = async () => {
        setRunning(true);
        try {
            const res = await runTestSuite();
            setResults(res);
        } catch (e) {
            console.error(e);
            setResults([{ name: "実行エラー", passed: false, message: "テストスイートがクラッシュしました。コンソールを確認してください。" }]);
        }
        setRunning(false);
    };

    return (
        <div className="absolute inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm">
            <div className="bg-gray-900 border border-gray-700 p-6 rounded-lg shadow-2xl w-96 max-h-[80vh] overflow-y-auto">
                <h2 className="text-xl font-bold text-white mb-4">システム診断</h2>
                
                {!results && !running && (
                    <div className="text-center">
                        <p className="text-gray-400 mb-4">物理演算エンジンの自動検証テストを実行します。</p>
                        <button 
                            onClick={run}
                            className="bg-blue-600 hover:bg-blue-500 text-white px-4 py-2 rounded font-bold transition-colors"
                        >
                            テスト実行
                        </button>
                    </div>
                )}

                {running && (
                    <div className="flex flex-col items-center py-8">
                        <div className="w-8 h-8 border-4 border-blue-500 border-t-transparent rounded-full animate-spin mb-2"></div>
                        <span className="text-gray-300">物理エンジン検証中...</span>
                    </div>
                )}

                {results && (
                    <div className="space-y-3">
                        {results.map((r, i) => (
                            <div key={i} className={`p-3 rounded border ${r.passed ? 'bg-green-900/30 border-green-800' : 'bg-red-900/30 border-red-800'}`}>
                                <div className="flex justify-between items-center mb-1">
                                    <span className={`font-bold ${r.passed ? 'text-green-400' : 'text-red-400'}`}>{r.name}</span>
                                    <span className={`text-xs uppercase font-bold ${r.passed ? 'text-green-500' : 'text-red-500'}`}>{r.passed ? 'PASS' : 'FAIL'}</span>
                                </div>
                                <p className="text-xs text-gray-300">{r.message}</p>
                            </div>
                        ))}
                        <div className="pt-4 flex justify-end gap-2">
                             <button 
                                onClick={run}
                                className="text-xs text-gray-400 hover:text-white underline mr-auto"
                            >
                                再実行
                            </button>
                            <button 
                                onClick={onClose}
                                className="bg-gray-700 hover:bg-gray-600 text-white px-3 py-1 rounded text-sm transition-colors"
                            >
                                閉じる
                            </button>
                        </div>
                    </div>
                )}
                 {!results && !running && (
                     <button onClick={onClose} className="mt-4 text-gray-500 hover:text-white text-sm w-full">キャンセル</button>
                 )}
            </div>
        </div>
    );
};

export default TestOverlay;