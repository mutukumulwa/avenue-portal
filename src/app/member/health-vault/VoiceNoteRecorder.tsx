"use client";

import { useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Mic, Square, Upload } from "lucide-react";
import { uploadVoiceJournalEntryAction } from "./actions";

export function VoiceNoteRecorder() {
  const router = useRouter();
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const chunksRef = useRef<BlobPart[]>([]);
  const [recording, setRecording] = useState(false);
  const [audioBlob, setAudioBlob] = useState<Blob | null>(null);
  const [audioUrl, setAudioUrl] = useState<string | null>(null);
  const [noteText, setNoteText] = useState("");
  const [tags, setTags] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);
  const [pending, startTransition] = useTransition();

  async function startRecording() {
    setError(null);
    setSaved(false);

    if (!navigator.mediaDevices?.getUserMedia) {
      setError("Voice recording is not supported in this browser.");
      return;
    }

    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const recorder = new MediaRecorder(stream);
      chunksRef.current = [];

      recorder.ondataavailable = (event) => {
        if (event.data.size > 0) chunksRef.current.push(event.data);
      };
      recorder.onstop = () => {
        const blob = new Blob(chunksRef.current, { type: recorder.mimeType || "audio/webm" });
        setAudioBlob(blob);
        setAudioUrl((current) => {
          if (current) URL.revokeObjectURL(current);
          return URL.createObjectURL(blob);
        });
        stream.getTracks().forEach((track) => track.stop());
      };

      mediaRecorderRef.current = recorder;
      recorder.start();
      setRecording(true);
    } catch {
      setError("Microphone access was not allowed. Check browser permissions and try again.");
    }
  }

  function stopRecording() {
    mediaRecorderRef.current?.stop();
    mediaRecorderRef.current = null;
    setRecording(false);
  }

  function saveRecording() {
    if (!audioBlob) {
      setError("Record a voice note before saving.");
      return;
    }

    setError(null);
    setSaved(false);
    startTransition(async () => {
      try {
        const formData = new FormData();
        formData.set("audio", new File([audioBlob], `voice-note-${Date.now()}.webm`, { type: audioBlob.type || "audio/webm" }));
        formData.set("noteText", noteText.trim() || "Voice note");
        formData.set("tags", tags.trim());
        await uploadVoiceJournalEntryAction(formData);
        setAudioBlob(null);
        if (audioUrl) URL.revokeObjectURL(audioUrl);
        setAudioUrl(null);
        setNoteText("");
        setTags("");
        setSaved(true);
        router.refresh();
      } catch (saveError) {
        setError(saveError instanceof Error ? saveError.message : "Unable to save voice note.");
      }
    });
  }

  return (
    <section className="rounded-[8px] border border-[#EEEEEE] bg-white p-5 shadow-sm">
      <h2 className="font-heading text-lg font-bold text-avenue-text-heading">Record a voice note</h2>
      <p className="mt-1 text-sm text-avenue-text-muted">
        Save a private audio note for symptoms, questions, or context before a visit. Transcription is not enabled yet.
      </p>

      <div className="mt-4 flex flex-wrap gap-2">
        {!recording ? (
          <button
            type="button"
            onClick={startRecording}
            disabled={pending}
            className="inline-flex items-center gap-2 rounded-[8px] bg-avenue-indigo px-4 py-2 text-sm font-semibold text-white shadow-sm hover:bg-avenue-indigo-hover disabled:opacity-50"
          >
            <Mic className="h-4 w-4" />
            Start recording
          </button>
        ) : (
          <button
            type="button"
            onClick={stopRecording}
            className="inline-flex items-center gap-2 rounded-[8px] bg-avenue-error px-4 py-2 text-sm font-semibold text-white shadow-sm"
          >
            <Square className="h-4 w-4" />
            Stop
          </button>
        )}
        <button
          type="button"
          onClick={saveRecording}
          disabled={!audioBlob || pending || recording}
          className="inline-flex items-center gap-2 rounded-[8px] border border-[#D6DCE5] px-4 py-2 text-sm font-semibold text-avenue-text-heading hover:bg-[#F8F9FA] disabled:opacity-50"
        >
          <Upload className="h-4 w-4" />
          {pending ? "Saving..." : "Save voice note"}
        </button>
      </div>

      {audioUrl && (
        <audio controls src={audioUrl} className="mt-4 w-full">
          <track kind="captions" />
        </audio>
      )}

      <div className="mt-4 grid gap-3">
        <textarea
          value={noteText}
          onChange={(event) => setNoteText(event.target.value)}
          rows={3}
          className="rounded-[8px] border border-[#D6DCE5] px-3 py-2 text-sm"
          placeholder="Optional short label or context for this voice note"
        />
        <input
          value={tags}
          onChange={(event) => setTags(event.target.value)}
          className="rounded-[8px] border border-[#D6DCE5] px-3 py-2 text-sm"
          placeholder="Tags, separated by commas"
        />
      </div>

      {error && <p className="mt-3 rounded-[8px] bg-red-50 px-3 py-2 text-sm font-semibold text-avenue-error">{error}</p>}
      {saved && <p className="mt-3 rounded-[8px] bg-[#28A745]/10 px-3 py-2 text-sm font-semibold text-[#1F7A34]">Voice note saved.</p>}
    </section>
  );
}
