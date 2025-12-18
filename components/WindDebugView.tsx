
import React from 'react';
import { WindBeltsResult, SimulationResult } from '../types';

interface Props {
    result: SimulationResult;
    onClose: () => void;
}

const WindDebugView: React.FC<Props> = ({ result, onClose }) => {
    const wind = result.wind;
    if (!wind) return null;

    return (
        <div className="fixed inset-0 z-[100] bg-black/80 flex items-center justify-center p-8 backdrop-blur-sm">
            <div className="bg-gray-900 border border-gray-700 rounded-lg shadow-2xl overflow-hidden max-w-2xl w-full flex flex-col">
                <div className="p-4 border-b border-gray-800 flex justify-between items-center bg-gray-950">
                    <h2 className="text-lg font-bold text-white flex items-center gap-2">
                        <span className="text-blue-500 font-mono text-xl">≋</span>
                        風帯解析デバッガー (Step 2)
                    </h2>
                    <button onClick={onClose} className="px-3 py-1 bg-gray-800 hover:bg-gray-700 text-gray-300 rounded text-xs transition-colors border border-gray-700">
                        閉じる
                    </button>
                </div>

                <div className="p-6 space-y-6">
                    <div className="grid grid-cols-2 gap-4">
                        <div className="bg-gray-800/50 p-4 rounded border border-gray-700">
                            <h3 className="text-[10px] font-bold text-gray-500 uppercase mb-3">循環境界 (北半球)</h3>
                            <div className="space-y-2">
                                {wind.cellBoundariesDeg.map((b, i) => (
                                    <div key={i} className="flex justify-between items-center text-xs">
                                        <span className="text-gray-400">境界 {i+1}:</span>
                                        <span className="font-mono text-white">{b.toFixed(1)}°</span>
                                    </div>
                                ))}
                            </div>
                        </div>

                        <div className="bg-gray-800/50 p-4 rounded border border-gray-700">
                            <h3 className="text-[10px] font-bold text-gray-500 uppercase mb-3">熱帯風パラメータ</h3>
                            <div className="space-y-2">
                                <div className="flex justify-between items-center text-xs">
                                    <span className="text-gray-400">貿易風ピーク位置:</span>
                                    <span className="font-mono text-yellow-400">±{wind.tradePeakOffsetDeg.toFixed(1)}°</span>
                                </div>
                                <div className="flex justify-between items-center text-xs">
                                    <span className="text-gray-400">無風帯 (doldrums) 幅:</span>
                                    <span className="font-mono text-white">{wind.doldrumsHalfWidthDeg.toFixed(1)}°</span>
                                </div>
                                <div className="flex justify-between items-center text-xs pt-2 border-t border-gray-700">
                                    <span className="text-gray-400 font-bold">海流への継承 Gap:</span>
                                    <span className="font-mono text-cyan-400 font-bold">{wind.oceanEcLatGapDerived.toFixed(1)}°</span>
                                </div>
                            </div>
                        </div>
                    </div>

                    <div className="bg-gray-950 p-4 rounded border border-gray-800">
                        <h3 className="text-[10px] font-bold text-gray-500 uppercase mb-3">計算コンテキスト</h3>
                        <div className="grid grid-cols-2 gap-x-8 gap-y-2 text-[10px] font-mono">
                            {Object.entries(wind.debug.paramsUsed).map(([k, v]) => (
                                <div key={k} className="flex justify-between border-b border-gray-800 pb-1">
                                    <span className="text-gray-500">{k}:</span>
                                    <span className="text-gray-300">{v}</span>
                                </div>
                            ))}
                            <div className="flex justify-between border-b border-gray-800 pb-1">
                                <span className="text-gray-500">modelLevel:</span>
                                <span className="text-blue-400 uppercase">{wind.modelLevel}</span>
                            </div>
                        </div>
                    </div>

                    <div className="text-[10px] text-gray-500 italic">
                        ※これらの値は惑星の半径、自転速度、ITCZの位置に基づいて動的に算出されています。
                    </div>
                </div>
            </div>
        </div>
    );
};

export default WindDebugView;
