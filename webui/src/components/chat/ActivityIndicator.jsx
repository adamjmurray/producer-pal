export function ActivityIndicator() {
  return (
    <div className="flex gap-2 justify-center">
      <PulsingBubble />
      <BouncingBubble />
      <PulsingBubble />
    </div>
  );
}

function PulsingBubble() {
  return (
    <span class="relative flex size-3">
      <span class="absolute inline-flex h-full w-full animate-ping rounded-full bg-sky-400 opacity-75"></span>{" "}
      <span class="relative inline-flex size-3 rounded-full bg-sky-500"></span>
    </span>
  );
}

function BouncingBubble() {
  return (
    <span class="relative flex size-3 animate-bounce">
      <span class="absolute inline-flex h-full w-full rounded-full bg-sky-400 opacity-25 scale-150"></span>{" "}
      <span class="relative inline-flex size-3 rounded-full bg-sky-500"></span>
    </span>
  );
}
