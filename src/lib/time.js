export function timeAgo(timestamp) {
  if (!timestamp) return 'Never played';
  const seconds = (Date.now() - timestamp) / 1000;
  if (seconds < 60) return 'Just now';
  const minutes = seconds / 60;
  if (minutes < 60) return `${Math.floor(minutes)} min ago`;
  const hours = minutes / 60;
  if (hours < 24) return `${Math.floor(hours)} h ago`;
  const days = hours / 24;
  if (days < 30) return `${Math.floor(days)} days ago`;
  return new Date(timestamp).toLocaleDateString();
}
