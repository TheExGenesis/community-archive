import React from 'react';

interface IconListItem {
    icon: React.ReactNode;
    text: React.ReactNode;
}

interface IconListProps {
    items: IconListItem[];
    variant: 'text' | 'card';
}

const IconList: React.FC<IconListProps> = ({ items, variant }) => {
    return (
        <div className="mb-4 space-y-2 flex flex-col align-start">
            {items.map(({ icon, text }, index) => (
                <div key={index} className={variant === "card" ? "flex items-center space-x-4 bg-gray-100 dark:bg-gray-900 p-2 rounded-md" : "flex items-center space-x-4 p-2"}
                    style={variant === "card" ? { maxWidth: '450px' } : {}}
                >
                    <div className="text-2xl">{icon}</div>
                    <div>{text}</div>
                </div>
            ))}
        </div>
    );
};

export default IconList;