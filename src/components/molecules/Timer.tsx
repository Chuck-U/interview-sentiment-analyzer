import dayjs from "dayjs";
import React, { useEffect, useState } from "react";


interface RecordingTimerProps {
    readonly recordingStartTime: number | null;
    readonly isRecording: boolean;
}


export const RecordingTimer = ({ recordingStartTime, isRecording }: RecordingTimerProps) => {
    const [recordingTime, setRecordingTime] = useState(0);
    useEffect(() => {
        setRecordingTime(recordingStartTime ?? 0)
        if (isRecording && recordingStartTime) {
            const interval = setInterval(() => {
                setRecordingTime(prev => prev + 1);
            }, 1000);
            return () => clearInterval(interval);
        }


    }, [isRecording, recordingStartTime]);

    return (

        <div className="flex items-center px-2 py-1 w-10 h-10 bg-black/50 rounded-full">
            {dayjs(recordingTime).format('HH:mm:ss').split(':').map((digit, idx) => (

                <span key={idx} className="text-[16px] text-[#32CD32] font-mono">{digit}</span>
            ))}
        </div>);
}