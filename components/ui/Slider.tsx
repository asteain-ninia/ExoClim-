
import React from 'react';

interface SliderProps {
  label: string;
  value: number;
  min: number;
  max: number;
  step: number;
  onChange: (value: number) => void;
  unit?: string;
  defaultValue?: number;
  color?: string;
  disabled?: boolean;
}

const Slider: React.FC<SliderProps> = ({ label, value, min, max, step, onChange, unit, defaultValue, color = "blue", disabled = false }) => {
  const handleMouseDown = (e: React.MouseEvent) => {
    if (!disabled && e.button === 1 && defaultValue !== undefined) {
      e.preventDefault();
      e.stopPropagation();
      onChange(defaultValue);
    }
  };

  const colorClasses: Record<string, string> = {
      blue: "accent-blue-500 text-blue-200",
      green: "accent-emerald-500 text-emerald-200",
      orange: "accent-orange-500 text-orange-200",
      purple: "accent-purple-500 text-purple-200",
      red: "accent-red-500 text-red-200",
      cyan: "accent-cyan-500 text-cyan-200",
  };
  const txtColor = disabled ? "text-gray-600" : (colorClasses[color] || colorClasses.blue);

  return (
    <div 
      className={`group border rounded px-3 py-2 transition-all ${disabled ? 'bg-gray-900 border-gray-800 opacity-50 cursor-not-allowed' : 'bg-gray-800/40 hover:bg-gray-800 border-gray-700/50 hover:border-gray-600'}`}
      onMouseDown={handleMouseDown}
      title={disabled ? "現在は無効化されています" : (defaultValue !== undefined ? `中クリックでリセット (Default: ${defaultValue}${unit || ''})` : '')}
    >
      <div className="flex justify-between items-center mb-1.5">
        <span className={`text-[10px] font-bold transition-colors tracking-wide truncate pr-2 ${disabled ? 'text-gray-600' : 'text-gray-400 group-hover:text-gray-300'}`}>
            {label}
        </span>
        <div className={`flex items-center rounded px-1.5 py-0.5 border transition-colors min-w-[3.5rem] justify-end ${disabled ? 'bg-gray-900 border-gray-800' : 'bg-gray-900 border-gray-700 group-hover:border-gray-500'}`}>
          <input 
            type="number"
            min={min}
            max={max}
            step={step}
            value={value}
            disabled={disabled}
            onChange={(e) => onChange(parseFloat(e.target.value))}
            className={`w-full bg-transparent text-right text-[10px] font-mono outline-none p-0 appearance-none ${txtColor}`}
          />
          <span className={`text-[9px] ml-0.5 whitespace-nowrap ${disabled ? 'text-gray-700' : 'text-gray-500'}`}>{unit}</span>
        </div>
      </div>
      <input
        type="range"
        min={min}
        max={max}
        step={step}
        value={value}
        disabled={disabled}
        onChange={(e) => onChange(parseFloat(e.target.value))}
        className={`w-full h-1.5 bg-gray-700 rounded-lg appearance-none ${disabled ? 'cursor-not-allowed' : 'cursor-pointer'} ${txtColor} opacity-80 hover:opacity-100 transition-opacity`}
      />
    </div>
  );
};

export default Slider;
