
import React from 'react';
import { Card } from './Card';
import { Heart, Star, TrendingUp } from 'lucide-react';

interface ProgressChartProps {
    data: { rep: number; avg: number }[];
    themeColor: string;
}

export const ProgressChart: React.FC<ProgressChartProps> = ({ data, themeColor }) => {
    if (!data || data.length === 0) {
        return (
            <Card className="p-6 text-center text-gray-400">
                <p>Complete quizzes to see your progress chart.</p>
            </Card>
        );
    }

    const width = 300;
    const height = 150;
    const padding = 20;
    const graphWidth = width - 2 * padding;
    const graphHeight = height - 2 * padding;

    // Determine X axis range (min 1 to max Rep found, at least 5)
    const maxRep = Math.max(Math.max(...data.map(d => d.rep)), 5);
    
    // Scale functions
    const getX = (rep: number) => padding + ((rep - 1) / (maxRep - 1 || 1)) * graphWidth;
    // Y is 0 to 100
    const getY = (score: number) => height - padding - (score / 100) * graphHeight;

    const points = data.map(d => `${getX(d.rep)},${getY(d.avg)}`).join(' ');

    // Encouragement Logic
    const lastRep = data[data.length - 1];
    let message = { text: "Consistency is key! Keep going.", icon: TrendingUp, color: "text-blue-500" };

    if (lastRep) {
        if (lastRep.rep >= 2 && lastRep.rep <= 5) {
             // Encourage 100% for 3rd, 4th, 5th
            if (lastRep.avg === 100) {
                message = { text: "Perfection! You're crushing it! ❤️", icon: Heart, color: "text-red-500" };
            } else if (lastRep.avg >= 80) {
                message = { text: "So close! Push for 100% next time! ✨", icon: Star, color: "text-amber-500" };
            } else {
                 message = { text: "Don't give up! Aim for 100%! 💪", icon: TrendingUp, color: `text-${themeColor}-500` };
            }
        } else if (lastRep.rep < 2) {
             message = { text: "Aim for 100% on your 3rd rep! 🚀", icon: Star, color: "text-indigo-500" };
        } else {
             message = { text: "You're a learning legend! 🌟", icon: Heart, color: "text-pink-500" };
        }
    }

    return (
        <Card className="p-4 bg-white dark:bg-gray-800">
            <div className="flex justify-between items-center mb-4">
                 <h3 className="text-sm font-semibold text-gray-600 dark:text-gray-300">Avg Score (%) vs Repetition #</h3>
                 <div className={`flex items-center space-x-1 text-[10px] font-bold ${message.color} bg-gray-50 dark:bg-gray-700/50 px-2 py-1 rounded-full animate-in fade-in border border-gray-100 dark:border-gray-700`}>
                    <message.icon size={10} />
                    <span>{message.text}</span>
                 </div>
            </div>
            
            <div className={`w-full overflow-hidden text-${themeColor}-600 dark:text-${themeColor}-400`}>
                <svg viewBox={`0 0 ${width} ${height}`} className="w-full h-auto">
                    {/* Grid Lines Y */}
                    {[0, 25, 50, 75, 100].map(y => (
                        <line 
                            key={y} 
                            x1={padding} 
                            y1={getY(y)} 
                            x2={width - padding} 
                            y2={getY(y)} 
                            stroke="currentColor" 
                            strokeOpacity="0.1"
                            strokeWidth="0.5" 
                        />
                    ))}

                    {/* Target Line for 100% */}
                    <line 
                        x1={padding} 
                        y1={getY(100)} 
                        x2={width - padding} 
                        y2={getY(100)} 
                        stroke="#10b981" 
                        strokeWidth="1" 
                        strokeDasharray="4 2"
                        opacity="0.5"
                    />

                    {/* Axes */}
                    <line x1={padding} y1={padding} x2={padding} y2={height - padding} stroke="currentColor" strokeOpacity="0.3" strokeWidth="1" />
                    <line x1={padding} y1={height - padding} x2={width - padding} y2={height - padding} stroke="currentColor" strokeOpacity="0.3" strokeWidth="1" />

                    {/* The Line */}
                    <polyline 
                        fill="none" 
                        stroke="currentColor" 
                        strokeWidth="2" 
                        points={points} 
                        strokeLinecap="round"
                        strokeLinejoin="round"
                    />

                    {/* Data Points */}
                    {data.map((d, i) => (
                        <circle 
                            key={i} 
                            cx={getX(d.rep)} 
                            cy={getY(d.avg)} 
                            r="3" 
                            fill="white"
                            stroke="currentColor"
                            strokeWidth="2" 
                        />
                    ))}

                    {/* X Labels */}
                    {Array.from({length: maxRep}, (_, i) => i + 1).map(r => (
                        <text key={r} x={getX(r)} y={height - 5} fontSize="8" textAnchor="middle" fill="currentColor" opacity="0.6">
                            {r}
                        </text>
                    ))}
                    
                    {/* Y Labels */}
                    <text x={padding - 5} y={getY(0)} fontSize="8" textAnchor="end" fill="currentColor" opacity="0.6">0</text>
                    <text x={padding - 5} y={getY(100)} fontSize="8" textAnchor="end" fill="#10b981">100</text>

                </svg>
            </div>
            <p className="text-center text-[10px] text-gray-400 dark:text-gray-500 mt-2">Repetition Number</p>
        </Card>
    );
};
