
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

const QuadrantDial: React.FC<DialProps> = ({ label, value, onChange, unit, defaultValue }) => {
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
            const pivotX = rect.left;
            const pivotY = rect.bottom;
            const dx = e.clientX - pivotX;
            const dy = pivotY - e.clientY;
            if (dx === 0 && dy === 0) return;
            let angleRad = Math.atan2(dy, dx);
            let angleDeg = angleRad * 180 / Math.PI;
            onChange(Math.max(0, Math.min(90, Math.round(90 - angleDeg))));
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
            className="group bg-gray-800/40 hover:bg-gray-800 border border-gray-700/50 hover:border-gray-600 rounded px-4 py-3 transition-all flex flex-col justify-between h-full"
            title={defaultValue !== undefined ? `中クリックでリセット (${defaultValue}${unit || ''})` : ''}
        >
             <div className="flex justify-between items-center w-full mb-2">
                <span className="text-[11px] font-bold text-gray-400 group-hover:text-gray-300 tracking-wide">{label}</span>
                <div className="flex items-center bg-gray-900 rounded px-1.5 py-0.5 border border-gray-700 group-hover:border-gray-500 transition-colors w-[4.5rem] justify-end">
                    <input 
                        type="number"
                        min={0}
                        max={90}
                        step={0.1}
                        value={value}
                        onChange={(e) => {
                           const v = parseFloat(e.target.value);
                           if (!isNaN(v)) onChange(v);
                        }}
                        className="w-full bg-transparent text-right text-[11px] font-mono outline-none p-0 appearance-none text-orange-200"
                    />
                    <span className="text-[9px] text-gray-500 ml-0.5">{unit}</span>
                </div>
            </div>
            
            <div className="relative w-28 h-48 self-center mt-2 select-none">
                <div 
                    ref={containerRef}
                    className="w-full h-full bg-gray-900 border-t border-r border-gray-600 rounded-tr-[100%] cursor-crosshair overflow-hidden relative shadow-inner"
                    onMouseDown={handleMouseDown}
                >
                    <div className="absolute bottom-0 left-0 w-[140%] h-[1px] bg-gray-800 origin-bottom-left rotate-[-30deg]"></div>
                    <div className="absolute bottom-0 left-0 w-[140%] h-[1px] bg-gray-800 origin-bottom-left rotate-[-60deg]"></div>
                    <div 
                        className="absolute bottom-0 left-0 w-[120%] h-0.5 bg-orange-500 origin-bottom-left shadow-[0_0_8px_rgba(249,115,22,0.8)] pointer-events-none"
                        style={{ transform: `rotate(${value - 90}deg)` }} 
                    >
                        <div className="absolute right-0 top-1/2 transform translate-x-1/2 -translate-y-1/2 w-2 h-2 bg-white rounded-full shadow-md"></div>
                    </div>
                </div>
            </div>
        </div>
    );
};

export default QuadrantDial;
