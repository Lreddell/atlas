
import React, { useEffect, useRef } from 'react';

export interface ChatMessage {
    id: number;
    text: string;
    type: 'info' | 'error' | 'success';
    timestamp: number;
    clickAction?: string; // Add optional action
}

interface ChatProps {
    messages: ChatMessage[];
    showInput: boolean;
    inputValue: string;
    setInputValue: (val: string) => void;
    onSubmitInput?: () => void;
    acCandidates?: string[];
    acIndex?: number;
    onMessageClick?: (action: string) => void;
    showSuggestions?: boolean;
}

export const Chat: React.FC<ChatProps> = ({ 
    messages, showInput, inputValue, setInputValue, onSubmitInput,
    acCandidates = [], acIndex = 0, onMessageClick, showSuggestions = false
}) => {
    const bottomRef = useRef<HTMLDivElement>(null);
    const inputRef = useRef<HTMLInputElement>(null);
    
    useEffect(() => {
        if (bottomRef.current) bottomRef.current.scrollIntoView({ behavior: 'smooth' });
    }, [messages, showInput]);

    useEffect(() => {
        if (showInput) {
            inputRef.current?.focus();
            inputRef.current?.setSelectionRange(inputValue.length, inputValue.length);
        }
    }, [showInput, inputValue]);

    const stopPropagation = (e: React.SyntheticEvent) => {
        e.stopPropagation();
    };

    return (
        <div 
            className="absolute bottom-2 left-2 z-[60] flex flex-col gap-1 w-[500px] pointer-events-none"
            onClick={stopPropagation}
            onMouseDown={stopPropagation}
            onMouseUp={stopPropagation}
        >
            <div className="flex flex-col gap-0.5 justify-end max-h-[300px] overflow-hidden mask-fade-top pb-1">
                {messages.map((msg) => (
                    <div 
                        key={msg.id} 
                        className={`
                            px-2 py-0.5 rounded text-shadow-sm font-medium bg-black/40 backdrop-blur-[1px]
                            ${msg.type === 'error' ? 'text-red-400' : msg.type === 'success' ? 'text-green-400' : 'text-white'}
                            ${msg.clickAction ? 'cursor-pointer hover:bg-black/60 pointer-events-auto' : ''}
                        `}
                        style={{
                            opacity: (Date.now() - msg.timestamp) > 10000 && !showInput ? 0 : 1,
                            transition: 'opacity 1s ease-out',
                        }}
                        onClick={(e) => {
                            if (msg.clickAction && onMessageClick) {
                                e.stopPropagation();
                                onMessageClick(msg.clickAction);
                            }
                        }}
                    >
                        {msg.text}
                        {msg.clickAction && (
                            <span className="ml-2 text-yellow-400 text-xs uppercase font-bold">[Click to TP]</span>
                        )}
                    </div>
                ))}
                <div ref={bottomRef} />
            </div>

            {showInput && (
                 <div 
                    className="relative bg-black/70 p-2 rounded pointer-events-auto"
                    onClick={stopPropagation}
                    onMouseDown={stopPropagation} 
                    onMouseUp={stopPropagation}
                    onContextMenu={stopPropagation}
                 >
                     {/* Autocomplete Suggestions (Above) */}
                     {showSuggestions && acCandidates.length > 0 && (
                         <div className="absolute bottom-[100%] left-0 w-full mb-1 flex flex-col-reverse bg-black/80 rounded overflow-hidden border border-white/20">
                             {acCandidates.map((c, i) => (
                                 <div 
                                    key={c}
                                    className={`px-2 py-1 text-sm ${i === acIndex ? 'bg-white/20 text-yellow-300' : 'text-gray-400'}`}
                                 >
                                     {c}
                                 </div>
                             ))}
                         </div>
                     )}

                     <input 
                         ref={inputRef}
                         autoFocus
                         type="text" 
                         value={inputValue}
                         onChange={(e) => setInputValue(e.target.value)}
                         onKeyDown={(e) => {
                             if (e.key !== 'Enter') return;
                             e.preventDefault();
                             e.stopPropagation();
                             onSubmitInput?.();
                         }}
                         className="w-full bg-transparent border-none outline-none text-white font-mono text-lg"
                         placeholder="Type a command..."
                     />
                 </div>
            )}
        </div>
    );
};
