
import React from 'react';

const Legend: React.FC<{ mode: string }> = ({ mode }) => {
    const containerClass = "absolute top-3 right-3 bg-gray-950/95 p-4 rounded-lg border border-white/20 backdrop-blur-md text-xs text-gray-100 shadow-xl max-w-[280px] overflow-y-auto max-h-[calc(100%-24px)] custom-scrollbar";
    const titleClass = "font-bold mb-3 text-white border-b border-gray-600 pb-1 text-sm";
    const labelClass = "text-gray-200";

    switch(mode) {
        case 'oceanCurrent':
            return (
                 <div className={containerClass}>
                    <h4 className={titleClass}>海流の動態 (循環ベクトル)</h4>
                    <div className="space-y-2">
                        <div className="flex items-center gap-2 mb-2">
                             <div className="w-12 h-5 rounded border border-white/20"
                                  style={{ background: 'linear-gradient(to right, #000000, #ff0000)' }}
                             ></div>
                             <span className="text-[10px] font-mono">離脱・暖流系 (赤)</span>
                        </div>
                        <div className="flex items-center gap-2 mb-2">
                             <div className="w-12 h-5 rounded border border-white/20"
                                  style={{ background: 'linear-gradient(to right, #000000, #0088ff)' }}
                             ></div>
                             <span className="text-[10px] font-mono">収束・寒流系 (青)</span>
                        </div>
                        <div className="flex items-center gap-2 mb-2">
                             <div className="w-12 h-5 rounded border border-white/20"
                                  style={{ background: 'linear-gradient(to right, #000000, #ff8c28)' }}
                             ></div>
                             <span className="text-[10px] font-mono">中緯度海流 (橙)</span>
                        </div>
                        <div className="flex flex-col gap-1 mt-2 pt-2 border-t border-gray-700">
                             <span className="text-[9px] text-gray-400">進入角と勢い:</span>
                             <div className="flex justify-between text-[9px] font-mono text-gray-500">
                                <span>緩やか(黒)</span>
                                <span>急峻(鮮明)</span>
                             </div>
                        </div>
                        <div className="flex items-center gap-2 mt-3 pt-2 border-t border-gray-700">
                             <div className="w-6 h-0 border-t border-white border-dashed"></div>
                             <span className="text-[10px] text-gray-400">ITCZ (収束中心線)</span>
                        </div>
                        <div className="flex items-center gap-2 mt-2 pt-2 border-t border-gray-700">
                             <span className="text-red-500 font-bold text-lg leading-none">×</span>
                             <span className="text-[10px] text-red-200">暖流の沿岸衝突 (ECC)</span>
                        </div>
                        <div className="flex items-center gap-2 mt-0">
                             <span className="text-cyan-400 font-bold text-lg leading-none">+</span>
                             <span className="text-[10px] text-cyan-200">寒流の沿岸衝突 (EC)</span>
                        </div>
                        <div className="flex items-center gap-2 mt-0">
                             <span className="text-orange-400 font-bold text-lg leading-none">◆</span>
                             <span className="text-[10px] text-orange-200">中緯度海流の衝突 (MLC)</span>
                        </div>
                    </div>
                </div>
            );
        case 'wind':
        case 'wind_belts':
            return (
                <div className={containerClass}>
                    <h4 className={titleClass}>{mode === 'wind_belts' ? '風帯デバッグ表示' : '抽象帯状風と気圧帯'}</h4>
                    <div className="h-4 w-full rounded-sm mb-1 border border-gray-700"
                        style={{ background: 'linear-gradient(to right, #2166ac, #f7f7f7, #b2182b)' }}
                    ></div>
                    <div className={`flex justify-between text-[10px] font-mono ${labelClass}`}>
                        <span>低圧 (青)</span><span>1013hPa</span><span>高圧 (赤)</span>
                    </div>
                    <p className="text-[9px] text-gray-400 mt-2 leading-tight">背景色は気圧、明るさは風速（東西U+南北V）を表現しています。</p>
                    {mode === 'wind_belts' && (
                        <div className="mt-2 p-2 bg-yellow-900/20 border border-yellow-700/50 rounded text-[9px] text-yellow-200 space-y-2">
                            <div className="flex items-center gap-2">
                                <div className="w-6 h-0 border-t border-dashed border-white/70"></div>
                                <span>循環セル境界</span>
                            </div>
                            <div className="flex items-center gap-2">
                                <div className="w-6 h-0.5 bg-yellow-400/80"></div>
                                <span>貿易風ピーク（ITCZ±オフセット）</span>
                            </div>
                        </div>
                    )}
                </div>
            );
        case 'itcz_heatmap':
             return (
                <div className={containerClass}>
                    <h4 className={titleClass}>ITCZ 熱影響マップ</h4>
                    <div className="h-4 w-full rounded-sm mb-1 border border-gray-700"
                        style={{ background: 'linear-gradient(to right, #2166ac, #f7f7f7, #b2182b)' }}
                    ></div>
                    <div className={`flex justify-between text-[10px] font-mono ${labelClass}`}>
                        <span>外洋 (-1.0)</span><span>中央</span><span>内陸 (+1.0)</span>
                    </div>
                </div>
            );
        case 'itcz_result':
             return (
                <div className={containerClass}>
                    <h4 className={titleClass}>ITCZ 算出緯度</h4>
                    <div className="space-y-2">
                        <div className="flex items-center gap-2">
                             <div className="w-8 h-1 bg-yellow-400"></div>
                             <span>年平均位置</span>
                        </div>
                        <div className="flex items-center gap-2">
                             <div className="w-8 h-1 bg-red-400/80"></div>
                             <span>7月位置 (北半球の夏)</span>
                        </div>
                        <div className="flex items-center gap-2">
                             <div className="w-8 h-1 bg-blue-400/80"></div>
                             <span>1月位置 (南半球の夏)</span>
                        </div>
                    </div>
                </div>
            );
        case 'temp':
        case 'tempZonal':
            return (
                <div className={containerClass}>
                    <h4 className={titleClass}>表面温度分布</h4>
                    <div className="h-4 w-full rounded-sm mb-1 border border-gray-700"
                        style={{ background: 'linear-gradient(to right, #313695, #4575b4, #e0f3f8, #fee090, #f46d43, #a50026)' }}
                    ></div>
                    <div className={`flex justify-between text-[10px] font-mono ${labelClass}`}>
                        <span>-40°C</span><span>0°C</span><span>+40°C</span>
                    </div>
                </div>
            );
        case 'precip':
            return (
                <div className={containerClass}>
                    <h4 className={titleClass}>降水量分布</h4>
                    <div className="h-3 w-full rounded-sm mb-1 border border-gray-700" style={{ background: 'linear-gradient(to right, #f7fbff, #08306b)' }}></div>
                    <div className={`flex justify-between text-[10px] font-mono ${labelClass}`}>
                        <span>0mm</span><span>多雨</span>
                    </div>
                </div>
            );
        case 'climate':
            return (
                <div className={containerClass}>
                    <h4 className={titleClass}>ケッペン気候区分</h4>
                    <div className="grid grid-cols-1 gap-1 text-[10px]">
                        <div className="font-bold text-blue-300 mt-1">A: 熱帯</div>
                        <div className="flex items-center gap-2"><div className="w-4 h-4" style={{ background: '#0000FF' }}></div><span>Af 熱帯雨林</span></div>
                        <div className="flex items-center gap-2"><div className="w-4 h-4" style={{ background: '#0077FF' }}></div><span>Am モンスーン</span></div>
                        <div className="flex items-center gap-2"><div className="w-4 h-4" style={{ background: '#44AAFF' }}></div><span>Aw/As サバナ</span></div>

                        <div className="font-bold text-red-300 mt-2">B: 乾燥</div>
                        <div className="flex items-center gap-2"><div className="w-4 h-4" style={{ background: '#FF0000' }}></div><span>BWh 砂漠 (高温)</span></div>
                        <div className="flex items-center gap-2"><div className="w-4 h-4" style={{ background: '#FF99AA' }}></div><span>BWk 砂漠 (寒冷)</span></div>
                        <div className="flex items-center gap-2"><div className="w-4 h-4" style={{ background: '#FFAA00' }}></div><span>BSh ステップ (高温)</span></div>
                        <div className="flex items-center gap-2"><div className="w-4 h-4" style={{ background: '#FFDD66' }}></div><span>BSk ステップ (寒冷)</span></div>

                        <div className="font-bold text-yellow-200 mt-2">C: 温帯</div>
                        <div className="flex items-center gap-2"><div className="w-4 h-4" style={{ background: '#00FF00' }}></div><span>Cfa/b 温暖湿潤・西岸海洋性</span></div>
                        <div className="flex items-center gap-2"><div className="w-4 h-4" style={{ background: '#FFFF00' }}></div><span>Cs 地中海性</span></div>
                        <div className="flex items-center gap-2"><div className="w-4 h-4" style={{ background: '#AAFF00' }}></div><span>Cw 温帯冬季少雨</span></div>

                        <div className="font-bold text-purple-300 mt-2">D: 冷帯</div>
                        <div className="flex items-center gap-2"><div className="w-4 h-4" style={{ background: '#00AAAA' }}></div><span>Df 亜寒帯湿潤</span></div>
                        <div className="flex items-center gap-2"><div className="w-4 h-4" style={{ background: '#FF00FF' }}></div><span>Ds/Dw 冷帯季節乾燥</span></div>

                        <div className="font-bold text-gray-300 mt-2">E: 寒帯</div>
                        <div className="flex items-center gap-2"><div className="w-4 h-4" style={{ background: '#B2B2B2' }}></div><span>ET ツンドラ</span></div>
                        <div className="flex items-center gap-2"><div className="w-4 h-4" style={{ background: '#FFFFFF', border: '1px solid #888' }}></div><span>EF 氷雪</span></div>

                        <div className="flex items-center gap-2 mt-2 pt-2 border-t border-gray-700"><div className="w-4 h-4" style={{ background: '#000066' }}></div><span>Oc 海洋</span></div>
                    </div>
                </div>
            );
        case 'insolation':
            return (
                <div className={containerClass}>
                    <h4 className={titleClass}>大気上端日射量 (TOA)</h4>
                    <div className="h-4 w-full rounded-sm mb-1 border border-gray-700"
                        style={{ background: 'linear-gradient(to right, #000033, #003366, #66aaff, #ffeb99, #ff9933, #ffffff)' }}
                    ></div>
                    <div className={`flex justify-between text-[10px] font-mono ${labelClass}`}>
                        <span>0 W/m²</span><span>~500 W/m²</span>
                    </div>
                    <p className="text-[9px] text-gray-400 mt-2 leading-tight">軌道幾何（離心率・地軸傾斜・近日点引数・主星光度）から算出した日平均値。</p>
                </div>
            );
        case 'distCoast':
            return (
                <div className={containerClass}>
                    <h4 className={titleClass}>海岸線からの距離</h4>
                    <div className="h-4 w-full rounded-sm mb-1 border border-gray-700" style={{ background: 'linear-gradient(to right, #74c476, #00441b)' }}></div>
                    <div className="text-[10px] text-gray-400 mb-2">内陸 (緑)</div>
                    <div className="h-4 w-full rounded-sm mb-1 border border-gray-700" style={{ background: 'linear-gradient(to right, #6baed6, #08306b)' }}></div>
                    <div className="text-[10px] text-gray-400">海洋 (青)</div>
                </div>
            );
        case 'elevation':
            return (
                <div className={containerClass}>
                    <h4 className={titleClass}>地形・標高データ</h4>
                    <div className="space-y-1">
                        <div className="text-[10px] text-gray-400 mb-1">陸域 (メートル)</div>
                        <div className="flex items-center gap-3"><div className="w-4 h-4 bg-[#663301]"></div><span>2000m 以上</span></div>
                        <div className="flex items-center gap-3"><div className="w-4 h-4 bg-[#cc9a45]"></div><span>1000m 前後</span></div>
                        <div className="flex items-center gap-3"><div className="w-4 h-4 bg-[#7fb86e]"></div><span>0m (平地)</span></div>
                        <div className="text-[10px] text-gray-400 mb-1 mt-2">海域 (水深)</div>
                        <div className="flex items-center gap-3"><div className="w-4 h-4 bg-[#7fcdbb]"></div><span>0m (大陸棚)</span></div>
                        <div className="flex items-center gap-3"><div className="w-4 h-4 bg-[#081d58]"></div><span>-4000m 以下</span></div>
                    </div>
                </div>
            );
        case 'step4':
            return (
                <div className={containerClass}>
                    <h4 className={titleClass}>Step 4: 気圧場 + 地衡風</h4>
                    <div className="h-4 w-full rounded-sm mb-1 border border-gray-700"
                        style={{ background: 'linear-gradient(to right, #2166ac, #f7f7f7, #b2182b)' }}
                    ></div>
                    <div className={`flex justify-between text-[10px] font-mono ${labelClass}`}>
                        <span>低圧 (青)</span><span>1013hPa</span><span>高圧 (赤)</span>
                    </div>
                    <p className="text-[9px] text-gray-400 mt-2 leading-tight">
                        色は気圧 anomaly、明るさは合成風速。陸海の温度差から内陸冷域に高気圧、
                        亜熱帯ジャイア中心に高気圧が配置され、地衡風として風帯に上乗せされる。
                    </p>
                </div>
            );
        default:
            return null;
      }
};

export default Legend;
