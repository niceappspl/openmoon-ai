import {
  Terminal, Settings, FolderOpen, Chrome, Globe, 
  Video, Code, Camera, Image, MapPin, Calculator,
  Clock, Package, MessageSquare, Mail, Music, Calendar, FileText} from 'lucide-react';

export const MAX_WINDOW_HEIGHT = 900;

export const getAppIcon = (appName: string) => {
  const name = appName.toLowerCase();

  if (name.includes('safari') || name.includes('browser')) return Globe;
  if (name.includes('chrome') || name.includes('chromium')) return Chrome;
  if (name.includes('message') || name.includes('imessage') || name.includes('slack') || name.includes('discord')) return MessageSquare;
  if (name.includes('mail') || name.includes('outlook')) return Mail;
  if (name.includes('facetime') || name.includes('zoom') || name.includes('teams')) return Video;
  if (name.includes('vscode') || name.includes('code') || name.includes('xcode') || name.includes('cursor')) return Code;
  if (name.includes('photo') || name.includes('preview')) return Image;
  if (name.includes('camera')) return Camera;
  if (name.includes('maps') || name.includes('location')) return MapPin;
  if (name.includes('music') || name.includes('spotify') || name.includes('itunes')) return Music;
  if (name.includes('calendar') || name.includes('fantastical')) return Calendar;
  if (name.includes('notes') || name.includes('notion') || name.includes('obsidian')) return FileText;
  if (name.includes('terminal') || name.includes('iterm')) return Terminal;
  if (name.includes('settings') || name.includes('preferences')) return Settings;
  if (name.includes('calculator')) return Calculator;
  if (name.includes('clock') || name.includes('time')) return Clock;
  if (name.includes('finder')) return FolderOpen;

  return Package;
};

// Import AI suggestions from testCommands to avoid duplication
import { TEST_COMMANDS } from './testCommands';

// Convert test commands to AI suggestions format
export const AI_SUGGESTIONS = TEST_COMMANDS
  .filter(cmd => 
    // Only include certain categories for AI suggestions
    ['Messages', 'Notes', 'Calendar', 'Reminders', 'Contacts', 'Mail', 'Maps', 'System', 'Quick Notes'].includes(cmd.category)
  )
  .slice(0, 30) // Limit to 30 suggestions
  .map(cmd => ({
    icon: cmd.icon,
    label: cmd.description,
    prompt: cmd.command,
    category: cmd.category
  }));
