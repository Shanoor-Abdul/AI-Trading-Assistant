export function parseDurationToSeconds(duration: string): number {
  if (!duration) return 300;
  
  const match = duration.match(/(\d+)([smhd])/);
  if (match) {
    const value = parseInt(match[1]);
    const unit = match[2];
    
    if (unit === 's') return value;
    if (unit === 'm') return value * 60;
    if (unit === 'h') return value * 3600;
    if (unit === 'd') return value * 86400;
  }
  
  // Fallback to 5 minutes
  return 300;
}
