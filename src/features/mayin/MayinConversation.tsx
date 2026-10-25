import { useState, useEffect, useRef } from "react";
import { Mic, MicOff, Send, Settings2, List, X, Check, AlertTriangle, Bot, ListStart, ListEnd } from "lucide-react";
import { motion, AnimatePresence } from "framer-motion";

interface MayinConversationProps {
  messages: Array<{from: 'user' | 'assistant'; text: string}>;
  transcript: string;
  listening: boolean;
  processing: boolean;
  onSend: () => void;
  onToggleListening: () => void;
  onChangeTranscript?: (val: string) => void;
}

export function MayinConversation({
  messages,
  transcript,
  listening,
  processing,
  onSend,
  onToggleListening,
  onChangeTranscript,
}: MayinConversationProps) {
  const [showSettings, setShowSettings] = useState(false);
  const [showHistory, setShowHistory] = useState(false);
  const messagesEndRef = useRef<HTMLDivElement>(null);

  // Auto-scroll to bottom when messages change
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  return (
    <div className="flex flex-col h-full">
      {/* Conversation Header */}
      <div className="flex items-center justify-between px-6 py-3 bg-slate-800/50 border-b border-white/5">
        <div className="flex items-center gap-2">
          <Bot className="w-5 h-5 text-emerald-400" />
          <h3 className="text-sm font-medium text-slate-200">Conversation</h3>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={() => setShowHistory(!showHistory)}
            className={`p-1 rounded ${showHistory ? "bg-emerald-500/20" : "hover:bg-slate-700/50"}`}
            title={showHistory ? "Hide History" : "Show History"}
          >
            <List className="w-4 h-4" />
          </button>
          <button
            onClick={() => setShowSettings(!showSettings)}
            className={`p-1 rounded ${showSettings ? "bg-emerald-500/20" : "hover:bg-slate-700/50"}`}
            title={showSettings ? "Close Settings" : "Open Settings"}
          >
            <Settings2 className="w-4 h-4" />
          </button>
        </div>
      </div>

      {/* Conversation Area */}
      <div className="flex-1 overflow-hidden flex">
        {/* History Panel */}
        <AnimatePresence>
          {showHistory && (
            <motion.div
              initial={{ width: 0, opacity: 0 }}
              animate={{ width: "300px", opacity: 1 }}
              exit={{ width: 0, opacity: 0 }}
              transition={{ type: "spring", damping: 20, stiffness: 300 }}
              className="bg-slate-800/30 border-r border-white/5 overflow-y-auto p-3"
            >
              <h4 className="text-xs font-medium text-slate-300 mb-3">Conversation History</h4>
              <div className="space-y-2">
                {messages.map((msg, i) => (
                  <div key={i} className={`p-2 rounded text-xs ${msg.from === "user" ? "bg-sky-500/20" : "bg-emerald-500/20"}`}>
                    <p className="font-medium">{msg.from === "user" ? "You" : "Dr. Mayin"}</p>
                    <p className="mt-1 text-slate-300">{msg.text.substring(0, 50)}{msg.text.length > 50 ? "..." : ""}</p>
                  </div>
                ))}
              </div>
            </motion.div>
          )}
        </AnimatePresence>

        {/* Main Conversation */}
        <div className="flex-1 overflow-y-auto p-4">
          <div className="space-y-4">
            {messages.map((msg, i) => (
              <div
                key={i}
                className={`flex ${msg.from === "user" ? "justify-end" : "justify-start"}`}
              >
                <div className={`max-w-[80%] p-3 rounded-lg ${msg.from === "user" ? "bg-sky-500/20" : "bg-emerald-500/20"}`}>
                  <p className="text-sm text-slate-100 whitespace-pre-wrap">{msg.text}</p>
                </div>
              </div>
            ))}

            {/* Typing indicator */}
            {listening && (
              <div className="flex justify-start">
                <div className="bg-emerald-500/20 p-3 rounded-lg">
                  <div className="flex gap-1">
                    {[0, 1, 2].map((i) => (
                      <motion.div
                        key={i}
                        className="w-2 h-2 rounded-full bg-emerald-400"
                        animate={{ y: [0, -5, 0], opacity: [0.3, 1, 0.3] }}
                        transition={{
                          duration: 1,
                          repeat: Infinity,
                          delay: i * 0.2,
                          ease: "easeInOut"
                        }}
                      />
                    ))}
                  </div>
                </div>
              </div>
            )}

            {/* Processing indicator */}
            {processing && (
              <div className="flex justify-start">
                <div className="bg-emerald-500/20 p-3 rounded-lg flex items-center gap-2">
                  <div className="w-4 h-4 border-2 border-emerald-400 border-t-transparent rounded-full animate-spin" />
                  <p className="text-xs text-slate-300">Processing...</p>
                </div>
              </div>
            )}

            <div ref={messagesEndRef} />
          </div>
        </div>
      </div>

      {/* Input Area */}
      <div className="px-4 py-3 bg-slate-800/50 border-t border-white/5">
        <div className="flex items-center gap-2">
          <button
            onClick={onToggleListening}
            className={`p-2 rounded-full ${listening ? "bg-red-500/20" : "bg-emerald-500/20"}`}
            title={listening ? "Stop Listening" : "Start Listening"}
          >
            {listening ? <MicOff className="w-5 h-5" /> : <Mic className="w-5 h-5" />}
          </button>
          <input
            value={transcript}
            onChange={(e) => onChangeTranscript?.(e.target.value)}
            placeholder="Type your message or speak..."
            className="flex-1 bg-slate-700/50 text-slate-100 rounded-lg px-4 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-emerald-400/50"
            disabled={processing}
          />
          <button
            onClick={onSend}
            disabled={!transcript || processing}
            className="p-2 rounded-full bg-emerald-500/20 disabled:opacity-50"
          >
            <Send className="w-5 h-5" />
          </button>
        </div>
      </div>

      {/* Settings Panel */}
      <AnimatePresence>
        {showSettings && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: "auto", opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ type: "spring", damping: 20, stiffness: 300 }}
            className="absolute bottom-16 right-4 w-64 bg-slate-800/90 rounded-lg border border-white/10 shadow-lg p-4"
          >
            <div className="flex justify-between items-center mb-4">
              <h4 className="text-sm font-medium text-slate-200">Settings</h4>
              <button onClick={() => setShowSettings(false)}>
                <X className="w-4 h-4 text-slate-400" />
              </button>
            </div>
            <div className="space-y-4">
              <div>
                <label className="text-xs text-slate-300 block mb-1">Voice Sensitivity</label>
                <input
                  type="range"
                  min="1"
                  max="10"
                  defaultValue="5"
                  className="w-full h-1 bg-slate-700 rounded-full appearance-none cursor-pointer"
                />
              </div>
              <div>
                <label className="text-xs text-slate-300 block mb-1">Response Speed</label>
                <select className="w-full bg-slate-700 text-slate-200 rounded px-2 py-1 text-xs">
                  <option>Normal</option>
                  <option>Fast</option>
                  <option>Slow</option>
                </select>
              </div>
              <div className="flex items-center gap-2">
                <input type="checkbox" id="auto-scroll" className="h-4 w-4" />
                <label htmlFor="auto-scroll" className="text-xs text-slate-300">Auto-scroll messages</label>
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

export default MayinConversation;