
import React, { useState, useEffect, useRef } from 'react';

interface DialProps {
    label: string;
    value: number;
    onChange: (val: number) => void;
    unit?: string;
    defaultValue?: number;
    min: number;
    max: number;
}

const CircularDial: React.FC<DialProps> = ({ label, value, onChange, unit, defaultValue }) => {
    const [isDragging, setIsDragging] = useState(false);
    const containerRef = useRef<HTMLDivElement>(null);

    const handleMouseDown = (e: React.MouseEvent) => {
        if (e.button === 1 && defaultValue !== undefined) {
            e.preventDefault();
            e.stopPropagation();
            onChange(defaultValue);
            return;
        }
        if (e.button === 0) {
            setIsDragging(true);
            e.preventDefault();
        }
    };

    useEffect(() => {
        const handleMouseMove = (e: MouseEvent) => {
            if (!isDragging || !containerRef.current) return;
            const rect = containerRef.current.getBoundingClientRect();
            const centerX = rect.left + rect.width / 2;
            const centerY = rect.top + rect.height / 2;
            const dx = e.clientX - centerX;
            const dy = e.clientY - centerY;
            
            let angleRad = Math.atan2(dy, dx); 
            let angleDeg = angleRad * 180 / Math.PI; 

            if (angleDeg < 0) angleDeg += 360;
            onChange(Math.round(angleDeg));
        };
        const handleMouseUp = () => setIsDragging(false);
        if (isDragging) {
            window.addEventListener('mousemove', handleMouseMove);
            window.addEventListener('mouseup', handleMouseUp);
        }
        return () => {
            window.removeEventListener('mousemove', handleMouseMove);
            window.removeEventListener('mouseup', handleMouseUp);
        };
    }, [isDragging, onChange]);

    return (
        <div 
            className="group bg-gray-800/40 hover:bg-gray-800 border border-gray-700/50 hover:border-gray-600 rounded px-4 py-3 transition-all flex flex-col h-full"
            title={defaultValue !== undefined ? `中クリックでリセット (${defaultValue}${unit || ''})` : ''}
        >
             <div className="flex justify-between items-center w-full mb-4">
                <span className="text-[11px] font-bold text-gray-400 group-hover:text-gray-300 tracking-wide">{label}</span>
                <div className="flex items-center bg-gray-900 rounded px-1.5 py-0.5 border border-gray-700 group-hover:border-gray-500 transition-colors w-[5rem] justify-end">
                    <input 
                        type="number"
                        min={0}
                        max={360}
                        step={1}
                        value={value}
                        onChange={(e) => {
                           const v = parseFloat(e.target.value);
                           if (!isNaN(v)) onChange(v);
                        }}
                        className="w-full bg-transparent text-right text-[11px] font-mono outline-none p-0 appearance-none text-blue-200"
                    />
                    <span className="text-[9px] text-gray-500 ml-0.5">{unit}</span>
                </div>
            </div>
            
            <div className="flex-1 flex items-center justify-center min-h-0">
                <div className="relative w-32 h-32 select-none flex items-center justify-center">
                    <div 
                        ref={containerRef}
                        className="w-full h-full bg-gray-950 border border-gray-700 rounded-full cursor-crosshair relative shadow-inner flex items-center justify-center"
                        onMouseDown={handleMouseDown}
                    >
                        <div className="absolute w-full h-[1px] bg-gray-900"></div>
                        <div className="absolute h-full w-[1px] bg-gray-900"></div>
                        
                        <div className="w-4 h-4 bg-yellow-500 rounded-full shadow-[0_0_12px_rgba(234,179,8,1)] z-10 border border-yellow-300"></div>
                        
                        <div className="absolute w-[80%] h-[80%] border border-dashed border-gray-800 rounded-full pointer-events-none"></div>

                        <div 
                            className="absolute w-1/2 h-0.5 bg-transparent origin-left left-1/2 pointer-events-none"
                            style={{ transform: `rotate(${value}deg)` }} 
                        >
                             <div className="absolute right-1 top-1/2 transform -translate-y-1/2 w-2.5 h-2.5 bg-blue-400 rounded-full shadow-[0_0_8px_rgba(96,165,250,0.8)] border border-white"></div>
                             <div className="absolute right-1 top-1/2 transform -translate-y-1/2 w-12 h-[1px] bg-gradient-to-r from-blue-600/0 to-blue-500/80 -ml-12"></div>
                        </div>
                    </div>
                </div>
            </div>
        </div>
    );
};

export default CircularDial;
