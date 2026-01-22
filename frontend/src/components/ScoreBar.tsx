interface ScoreBarProps {
    label: string;
    score: number;
    color?: 'blue' | 'green' | 'purple' | 'orange' | 'red' | 'gray';
}

const colorClasses = {
    blue: 'bg-blue-500',
    green: 'bg-green-500',
    purple: 'bg-purple-500',
    orange: 'bg-orange-500',
    red: 'bg-red-500',
    gray: 'bg-gray-500',
};

export default function ScoreBar({
    label,
    score,
    color = 'blue',
}: ScoreBarProps) {
    const percentage = Math.round(score * 100);
    const bgColor = colorClasses[color];

    return (
        <div>
            <div className="flex justify-between text-xs mb-1">
                <span className="text-gray-600">{label}</span>
                <span className="font-medium text-gray-800">{percentage}%</span>
            </div>
            <div className="h-2 bg-gray-100 rounded-full overflow-hidden">
                <div
                    className={`h-full ${bgColor} rounded-full transition-all duration-300`}
                    style={{ width: `${percentage}%` }}
                />
            </div>
        </div>
    );
}
