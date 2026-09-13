import React, { useState, useRef } from 'react';

interface UniversalVoiceInputProps {
    processEndpoint: string;
    onTextReceived: (text: string) => void;
}

export default function UniversalVoiceInput({ processEndpoint, onTextReceived }: UniversalVoiceInputProps) {
    const [comment, setComment] = useState('');
    const [isRecording, setIsRecording] = useState(false);
    const [isProcessing, setIsProcessing] = useState(false);
    const [error, setError] = useState<string | null>(null);


    const mediaRecorderRef = useRef<MediaRecorder | null>(null);
    const audioChunksRef = useRef<Blob[]>([]);

    const API_BASE = process.env.NEXT_PUBLIC_API_URL?.replace(/\/$/, "") || "http://127.0.0.1:8000";

    // 1. Старт записи аудио в файл
    const startRecording = async () => {
        try {
            const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
            mediaRecorderRef.current = new MediaRecorder(stream);
            audioChunksRef.current = []; // Очищаем старые чанки

            mediaRecorderRef.current.ondataavailable = (event) => {
                if (event.data.size > 0) {
                    audioChunksRef.current.push(event.data);
                }
            };

            mediaRecorderRef.current.onstop = async () => {
                const audioBlob = new Blob(audioChunksRef.current, { type: 'audio/webm' });
                await sendAudioToServer(audioBlob);
            };

            mediaRecorderRef.current.start();
            setIsRecording(true);
        } catch (err) {
            const message = err instanceof Error ? err.message : String(err);
            alert('Ошибка доступа к микрофона: ' + message);
        }
    };

    // 2. Остановка записи
    const stopRecording = () => {
        setError(null);
        if (mediaRecorderRef.current && isRecording) {
            mediaRecorderRef.current.stop();
            setIsRecording(false);
            mediaRecorderRef.current.stream.getTracks().forEach(track => track.stop());
        }
    };

    // 3. Отправка аудио на бэкенд
    const sendAudioToServer = async (audioBlob: Blob) => {
        setIsProcessing(true);
        setError(null);

        // Формируем данные формы для отправки файла
        const formData = new FormData();
        formData.append('audio', audioBlob, 'voice.webm');

        try {
            const response = await fetch(`${API_BASE}${processEndpoint}`, {
                method: 'POST',
                body: formData,
            });

            const data = await response.json();

            if (!response.ok) {
                throw new Error(data.error || 'Ошибка сервера');
            }
            if (data.text) {
                onTextReceived(data.text);
            }
            if (!data.text) {
                const message = 'Не удалось распознать речь.';
                setError(message);
                setTimeout(() => {
                    setError(null);
                }, 4000);
                return;
            }
        } catch (error) {
            const message = 'Не удалось распознать речь.';
            setError(message);
            setTimeout(() => {
                setError(null);
            }, 4000);

            return;
        } finally {
            setIsProcessing(false);
        }
    };

    return (
        <div style={{ maxWidth: '500px', fontFamily: 'sans-serif' }}>
            <div style={{ position: 'relative' }}>
                <div className="flex items-center gap-4">
                    <button
                        className="px-5 py-2.5 rounded-xl bg-blue-500 hover:bg-blue-400 text-white font-medium text-sm sm:text-base shadow-lg shadow-blue-500/25 focus-ring"
                        type="button"
                        onClick={isRecording ? stopRecording : startRecording}
                        disabled={isProcessing}
                        title={isRecording ? 'Остановить запись и распознать' : 'Начать голосовой ввод'}
                        style={{
                            position: 'sticky',
                            cursor: isProcessing ? 'not-allowed' : 'pointer',
                            fontSize: '20px',
                            opacity: isProcessing ? 0.5 : 1
                        }}
                    >
                        {isRecording ? '🛑' : '🎙️'}
                    </button>

                    {isRecording && (
                        <div className="audio-waves flex-grow min-w-0 overflow-hidden">
                            <span className="wave-bar"></span>
                            <span className="wave-bar"></span>
                            <span className="wave-bar"></span>
                            <span className="wave-bar"></span>
                            <span className="wave-bar"></span>
                            <span className="wave-bar"></span>
                            <span className="wave-bar"></span>
                            <span className="wave-bar"></span>
                            <span className="wave-bar"></span>
                            <span className="wave-bar"></span>
                            <span className="wave-bar"></span>
                            <span className="wave-bar"></span>
                        </div>
                    )}

                    {isProcessing && (
                        <p style={{ fontSize: '14px', color: '#3b82f6', marginTop: '5px' }}>
                            Аудио обрабатывается, пожалуйста, подождите...
                        </p>
                    )}
                    {!isProcessing && !isRecording && error && (
                        <span className="flex-grow text-xs sm:text-sm text-red-400 font-medium truncate animate-fade-in">
                            ❌ {error}
                        </span>
                    )}

                    <style>{`
            .audio-waves {
            display: flex;
            align-items: center;
            gap: 4px;
            height: 30px;
            padding: 0 5px;
            }

            .wave-bar {
            display: inline-block;
            width: 5px;
            height: 8px;
            background-color:#5b8cff;
            border-radius: 2px;
            animation: soundWave 1s ease-in-out infinite alternate;
            }

            .wave-bar:nth-child(1)  { animation-delay: 0.1s; animation-duration: 0.8s; }
            .wave-bar:nth-child(2)  { animation-delay: 0.3s; animation-duration: 1.1s; }
            .wave-bar:nth-child(3)  { animation-delay: 0.0s; animation-duration: 0.9s; }
            .wave-bar:nth-child(4)  { animation-delay: 0.5s; animation-duration: 1.2s; }
            .wave-bar:nth-child(5)  { animation-delay: 0.2s; animation-duration: 0.7s; }
            .wave-bar:nth-child(6)  { animation-delay: 0.4s; animation-duration: 1.0s; }
            .wave-bar:nth-child(7)  { animation-delay: 0.15s; animation-duration: 0.85s; }
            .wave-bar:nth-child(8)  { animation-delay: 0.35s; animation-duration: 1.15s; }
            .wave-bar:nth-child(9)  { animation-delay: 0.05s; animation-duration: 0.95s; }
            .wave-bar:nth-child(10) { animation-delay: 0.45s; animation-duration: 1.25s; }
            .wave-bar:nth-child(11) { animation-delay: 0.25s; animation-duration: 0.75s; }
            .wave-bar:nth-child(12) { animation-delay: 0.55s; animation-duration: 1.05s; }

            @keyframes soundWave {
            0% {
                height: 6px;
                transform: scaleY(1);
            }
            100% {
                height: 28px; 
                transform: scaleY(1);
            }
            }
        `}</style>
                </div>

                <style>{`
            @keyframes pulse {
            0% { transform: scale(1); opacity: 1; }
            50% { transform: scale(1.2); opacity: 0.7; }
            100% { transform: scale(1); opacity: 1; }
            }
        `}</style>
            </div>
        </div>
    );
}
