import React from 'react';
import { 
  FileCode, 
  Atom, 
  Terminal, 
  FileJson, 
  FileText, 
  Globe, 
  Hash, 
  File 
} from 'lucide-react';

export default function FileIcon({ filename, size = 14, ...props }) {
  if (!filename) return <File size={size} {...props} />;
  
  const ext = filename.split('.').pop().toLowerCase();
  
  const iconMap = {
    js: { icon: FileCode, color: '#f59e0b' },      // Yellow
    jsx: { icon: Atom, color: '#60a5fa' },         // Blue (React)
    ts: { icon: FileCode, color: '#2563eb' },      // Deep Blue
    tsx: { icon: Atom, color: '#38bdf8' },         // React TSX
    html: { icon: Globe, color: '#ea580c' },       // Orange
    css: { icon: Hash, color: '#3b82f6' },          // Blue
    scss: { icon: Hash, color: '#ec4899' },         // Pink
    json: { icon: FileJson, color: '#10b981' },     // Green
    yml: { icon: FileJson, color: '#84cc16' },      // Light Green
    yaml: { icon: FileJson, color: '#84cc16' },     // Light Green
    md: { icon: FileText, color: '#a855f7' },       // Purple
    py: { icon: FileCode, color: '#34d399' },       // Teal Green
    sh: { icon: Terminal, color: '#f43f5e' },       // Rose
    dockerfile: { icon: Terminal, color: '#0ea5e9' },
  };

  const bare = filename.split('/').pop().toLowerCase();
  if (bare === 'dockerfile') {
    return <Terminal size={size} color="#0ea5e9" {...props} />;
  }

  const match = iconMap[ext];
  if (match) {
    const IconComponent = match.icon;
    return <IconComponent size={size} color={match.color} {...props} />;
  }

  return <File size={size} color="var(--text-dark)" {...props} />;
}
