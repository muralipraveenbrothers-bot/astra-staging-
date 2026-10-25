import { useState, useEffect, useRef, useCallback } from "react";
import { MessageSquare, Phone, Video, Mic, MicOff, VideoOff, PhoneOff, Users, Send, Mic as MicIcon } from "lucide-react";
import { GlassCard, Badge } from "@/components/ui";
import { useAuth } from "@/lib/auth";
import { toast } from "sonner";

type Signal = 
  | { type: "joined"; room: string; peerId: string; peers: any[]; callId: string }
  | { type: "peer-joined"; peer: any }
  | { type: "peer-left"; peerId: string }
  | { type: "offer" | "answer" | "ice"; payload: any; from: string }
  | { type: "chat"; text: string; from: string; fromRole: string; at: string };

export function AstraCommApp() {
  const { account } = useAuth();
  const token = localStorage.getItem("astra.serverToken") || "";
  const [isConnected, setIsConnected] = useState(false);
  const [peers, setPeers] = useState<any[]>([]);
  const [messages, setMessages] = useState<{ type: string; text: string; from?: string; fromRole?: string; at: string; self?: boolean }[]>([]);
  const [chatText, setChatText] = useState("");
  const [isRecording, setIsRecording] = useState(false);
  
  const [inCall, setInCall] = useState(false);
  const [videoEnabled, setVideoEnabled] = useState(false);
  const [audioEnabled, setAudioEnabled] = useState(false);
  
  const ws = useRef<WebSocket | null>(null);
  const pc = useRef<RTCPeerConnection | null>(null);
  const localStream = useRef<MediaStream | null>(null);
  const localVideoRef = useRef<HTMLVideoElement>(null);
  const remoteVideoRef = useRef<HTMLVideoElement>(null);
  const room = "general-comm";

  const connectWebSocket = useCallback(() => {
    const tokenVal = localStorage.getItem("astra.serverToken") || "";
    const protocol = window.location.protocol === "https:" ? "wss:" : "ws:";
    const wsUrl = `${protocol}//${window.location.host}/ws/staff-call?token=${tokenVal}`;
    
    ws.current = new WebSocket(wsUrl);
    
    ws.current.onopen = () => {
      setIsConnected(true);
      ws.current?.send(JSON.stringify({ type: "join", room, name: account?.name, role: account?.role }));
    };

    ws.current.onmessage = async (event: MessageEvent) => {
      const data = JSON.parse(event.data) as Signal;
      
      switch (data.type) {
        case "joined":
          setPeers(data.peers);
          break;
        case "peer-joined":
          setPeers(prev => [...prev, data.peer]);
          break;
        case "peer-left":
          setPeers(prev => prev.filter(p => p.id !== data.peerId));
          break;
        case "chat":
          setMessages(prev => [...prev, data]);
          break;
        case "offer":
          if (!pc.current) initializeRTC();
          await pc.current?.setRemoteDescription(new RTCSessionDescription(data.payload));
          const answer = await pc.current?.createAnswer();
          await pc.current?.setLocalDescription(answer);
          ws.current?.send(JSON.stringify({ type: "answer", payload: answer, to: data.from }));
          setInCall(true);
          break;
        case "answer":
          await pc.current?.setRemoteDescription(new RTCSessionDescription(data.payload));
          break;
        case "ice":
          if (data.payload) {
            await pc.current?.addIceCandidate(new RTCIceCandidate(data.payload));
          }
          break;
      }
    };

    ws.current.onclose = () => setIsConnected(false);
  }, [account]);

  useEffect(() => {
    connectWebSocket();
    return () => {
      ws.current?.close();
      localStream.current?.getTracks().forEach(t => t.stop());
      pc.current?.close();
    };
  }, [account]);

  useEffect(() => {
    if (token) {
      fetch("/api/communications/messages", {
        headers: { Authorization: `Bearer ${token}` }
      })
      .then(res => res.json())
      .then(data => {
        if (data.messages) {
          const loaded = data.messages.map((m: any) => ({
            type: "chat",
            text: m.text,
            from: m.fromName || m.from,
            fromRole: "staff", // could extract from metadata
            at: m.at,
            self: m.from === account?.id
          }));
          setMessages(loaded);
        }
      })
      .catch(err => console.error("Failed to load chat history", err));
    }
  }, [account?.id]);

  const initializeRTC = async (withVideo = false) => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ video: withVideo, audio: true });
      localStream.current = stream;
      if (localVideoRef.current) localVideoRef.current.srcObject = stream;
      setAudioEnabled(true);
      setVideoEnabled(withVideo);

      pc.current = new RTCPeerConnection({
        iceServers: [{ urls: "stun:stun.l.google.com:19302" }]
      });

      stream.getTracks().forEach(track => pc.current?.addTrack(track, stream));

      pc.current.onicecandidate = (event) => {
        if (event.candidate) {
          ws.current?.send(JSON.stringify({ type: "ice", payload: event.candidate }));
        }
      };

      pc.current.ontrack = (event) => {
        if (remoteVideoRef.current && event.streams[0]) {
          remoteVideoRef.current.srcObject = event.streams[0];
        }
      };

      setInCall(true);
    } catch (e) {
      console.error("Error accessing media devices.", e);
    }
  };

  const startCall = async (withVideo = false) => {
    await initializeRTC(withVideo);
    const offer = await pc.current?.createOffer();
    await pc.current?.setLocalDescription(offer);
    ws.current?.send(JSON.stringify({ type: "offer", payload: offer }));
  };

  const endCall = () => {
    localStream.current?.getTracks().forEach(t => t.stop());
    pc.current?.close();
    pc.current = null;
    setInCall(false);
    setAudioEnabled(false);
    setVideoEnabled(false);
  };

  const toggleMic = () => {
    if (localStream.current) {
      const audioTrack = localStream.current.getAudioTracks()[0];
      if (audioTrack) {
        audioTrack.enabled = !audioTrack.enabled;
        setAudioEnabled(audioTrack.enabled);
      }
    }
  };

  const toggleVideo = () => {
    if (localStream.current) {
      const videoTrack = localStream.current.getVideoTracks()[0];
      if (videoTrack) {
        videoTrack.enabled = !videoTrack.enabled;
        setVideoEnabled(videoTrack.enabled);
      }
    }
  };

  const sendChat = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!chatText.trim() || !ws.current) return;
    const textToSend = chatText;
    setChatText("");
    
    // Broadcast via WebRTC signaling server for instant peer-to-peer feel
    ws.current.send(JSON.stringify({ type: "chat", text: textToSend }));
    
    // Add locally for optimistic UI
    setMessages(prev => [...prev, { type: "chat", text: textToSend, from: account?.name, fromRole: account?.role, at: new Date().toISOString(), self: true }]);
    
    // Persist to backend
    try {
      await fetch("/api/communications/messages", {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
        body: JSON.stringify({ to: "global", text: textToSend })
      });
    } catch (err) {
      console.error("Failed to save message", err);
    }
  };

  const startVoiceDictation = () => {
    const SpeechRecognition = (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;
    if (!SpeechRecognition) {
      toast.error("Voice dictation is not supported in this browser.");
      return;
    }
    const recognition = new SpeechRecognition();
    recognition.lang = "en-US";
    recognition.interimResults = false;
    recognition.maxAlternatives = 1;

    recognition.onstart = () => setIsRecording(true);
    recognition.onresult = (event: any) => {
      const transcript = event.results[0][0].transcript;
      setChatText(prev => prev + (prev ? " " : "") + transcript);
    };
    recognition.onerror = (event: any) => {
      console.error("Speech recognition error", event.error);
      setIsRecording(false);
    };
    recognition.onend = () => setIsRecording(false);
    
    recognition.start();
  };

  return (
    <div className="flex flex-col md:flex-row gap-4 h-[calc(100vh-140px)]">
      {/* Sidebar: Peers */}
      <GlassCard className="w-full md:w-64 flex flex-col gap-4">
        <h3 className="font-semibold text-white flex items-center gap-2 border-b border-white/10 pb-2">
          <Users size={16} className="text-cyan-400" /> Directory
          <Badge tone={isConnected ? "green" : "neutral"} className="ml-auto text-[10px]">
            {isConnected ? "Online" : "Offline"}
          </Badge>
        </h3>
        <div className="flex-1 overflow-y-auto space-y-2">
          {peers.map(peer => (
            <div key={peer.id} className="flex items-center gap-2 p-2 rounded-lg bg-white/5 border border-white/5">
              <div className="w-2 h-2 rounded-full bg-emerald-400" />
              <div>
                <div className="text-sm font-medium text-white">{peer.name}</div>
                <div className="text-xs text-slate-400 uppercase">{peer.role}</div>
              </div>
            </div>
          ))}
          {peers.length === 0 && (
            <div className="text-xs text-slate-500 italic">No peers online in this room.</div>
          )}
        </div>
      </GlassCard>

      {/* Main Chat/Call Area */}
      <div className="flex-1 flex flex-col gap-4">
        {/* WebRTC Video/Call Container */}
        {inCall && (
          <GlassCard className="h-64 flex flex-col border-cyan-500/30">
            <div className="flex-1 relative flex gap-2">
              <div className="flex-1 bg-black rounded-lg overflow-hidden relative">
                <video ref={remoteVideoRef} autoPlay playsInline className="w-full h-full object-cover" />
                <div className="absolute bottom-2 left-2 text-xs bg-black/50 px-2 py-1 rounded text-white">Remote</div>
              </div>
              <div className="w-1/3 bg-black rounded-lg overflow-hidden relative">
                <video ref={localVideoRef} autoPlay playsInline muted className="w-full h-full object-cover" />
                <div className="absolute bottom-2 left-2 text-xs bg-black/50 px-2 py-1 rounded text-white">You</div>
              </div>
            </div>
            <div className="flex justify-center gap-4 mt-4">
              <button onClick={toggleMic} className={`rounded-full p-3 border border-white/10 hover:bg-white/10 transition-colors ${!audioEnabled ? "bg-red-500/20 text-red-400 border-red-500/30" : "text-white"}`}>
                {audioEnabled ? <Mic size={20} /> : <MicOff size={20} />}
              </button>
              <button onClick={toggleVideo} className={`rounded-full p-3 border border-white/10 hover:bg-white/10 transition-colors ${!videoEnabled ? "bg-red-500/20 text-red-400 border-red-500/30" : "text-white"}`}>
                {videoEnabled ? <Video size={20} /> : <VideoOff size={20} />}
              </button>
              <button onClick={endCall} className="rounded-full p-3 bg-red-600 hover:bg-red-500 text-white transition-colors">
                <PhoneOff size={20} />
              </button>
            </div>
          </GlassCard>
        )}

        {/* Chat Interface */}
        <GlassCard className="flex-1 flex flex-col">
          <div className="flex items-center justify-between border-b border-white/10 pb-3 mb-3">
            <div className="font-semibold flex items-center gap-2 text-white">
              <MessageSquare size={16} className="text-cyan-400" />
              Astra Connect
            </div>
            {!inCall && (
              <div className="flex gap-2">
                <button onClick={() => startCall(false)} className="flex items-center text-xs py-1 px-3 h-8 border border-white/10 rounded hover:bg-white/10 text-white transition-colors"><Phone size={14} className="mr-1" /> Audio</button>
                <button onClick={() => startCall(true)} className="flex items-center text-xs py-1 px-3 h-8 border border-white/10 rounded hover:bg-white/10 text-white transition-colors"><Video size={14} className="mr-1" /> Video</button>
              </div>
            )}
          </div>
          
          <div className="flex-1 overflow-y-auto space-y-4 mb-4 pr-2">
            {messages.map((m, i) => (
              <div key={i} className={`flex flex-col ${m.self ? 'items-end' : 'items-start'}`}>
                <div className={`max-w-[80%] rounded-xl px-4 py-2 ${m.self ? 'bg-cyan-600/80 text-white rounded-br-sm' : 'bg-white/10 text-white rounded-bl-sm'}`}>
                  {!m.self && <div className="text-[10px] text-cyan-300 font-semibold mb-1">{m.from} ({m.fromRole})</div>}
                  <div className="text-sm">{m.text}</div>
                </div>
                <div className="text-[10px] text-slate-500 mt-1">{new Date(m.at).toLocaleTimeString()}</div>
              </div>
            ))}
          </div>

          <form onSubmit={sendChat} className="flex gap-2 relative">
            <button 
              type="button" 
              onClick={startVoiceDictation} 
              className={`absolute left-2 top-1.5 p-1.5 rounded-full transition-colors ${isRecording ? "bg-red-500/20 text-red-400 animate-pulse" : "bg-white/5 text-slate-300 hover:bg-white/10"}`}
            >
              <MicIcon size={16} />
            </button>
            <input 
              type="text" 
              value={chatText}
              onChange={e => setChatText(e.target.value)}
              placeholder={isRecording ? "Listening..." : "Type a message..."}
              className="flex-1 bg-black/40 border border-slate-700 rounded-full pl-10 pr-12 py-2.5 text-sm text-white focus:border-cyan-500 outline-none"
            />
            <button type="submit" disabled={!chatText.trim()} className="absolute right-2 top-1.5 p-1.5 rounded-full bg-cyan-500/20 text-cyan-400 hover:bg-cyan-500/40 disabled:opacity-50 transition-colors">
              <Send size={16} />
            </button>
          </form>
        </GlassCard>
      </div>
    </div>
  );
}
