# openMOON AI — Examples

Natural language commands you can type into the launcher.
All commands work in English and Polish.

---

## System & Apps

```
open Safari
quit Spotify
what apps are running?
list installed apps
```

```
set volume to 60
turn volume up / mute
set brightness up / down
toggle dark mode
enable Do Not Disturb / focus mode
```

```
take a screenshot
lock screen
put display to sleep
check battery status
check WiFi status / what network am I on?
```

```
restart computer
shutdown computer
empty trash
run command: ls ~/Desktop
```

---

## Communication

```
send message to John saying "I'll be 10 minutes late"
send email to anna@example.com subject: Invoice body: Please find attached
check unread emails
search emails for "invoice"
read my recent emails
```

---

## Calendar & Reminders

```
show my calendar for today
show my schedule for tomorrow
what do I have this week?
create calendar event: Team sync on: 2026-06-10 14:00
```

```
show all my reminders
remind me to call dentist tomorrow at 9am
search reminders for "groceries"
```

---

## Notes & Contacts

```
show my notes
list all my notes
create note: Meeting Notes — today we decided to...
search notes for "budget"
```

```
find contact John Smith
show contact info for Mom
```

---

## Maps

```
search for coffee shops near me
get directions from home to Stary Browar Poznań
search for parking in Poznań
```

---

## Files

```
read ~/Documents/notes.txt
write "Hello" to ~/Desktop/test.txt
list files in ~/Downloads
search for TODO in ~/Projects
get info about ~/Downloads/file.zip
```

---

## Browser

```
open google.com
search for "best sushi in Poznań"
list open tabs in Chrome
close current tab
bookmark this page
save page as PDF
clear browsing history
```

---

## Media

```
play / pause music
next track / previous track
what's playing?
set Music volume to 70
search and play "Bohemian Rhapsody"
toggle shuffle / repeat
start screen recording
stop screen recording
```

---

## Tasks & Productivity (in-app)

```
create task: Review PR by Friday — priority high
list all tasks
list high priority tasks
complete task 3
```

```
start pomodoro 25 minutes — Deep work
start break 5 minutes
show pomodoro stats
```

```
track habit: workout
get habit streak: meditation
```

---

## Quick Notes (local, instant)

```
remember to buy milk
remember: API key is ABC-123
what did I remember?
forget all
```

---

## Multi-step examples (real power)

```
Find the invoice email from last week and reply that I'll pay on Friday
```

```
Open Figma and take a screenshot
```

```
Search for coffee shops and get directions to the first result
```

```
Create a task "Prepare presentation" and set a reminder for tomorrow 9am
```

```
Check unread emails, then search notes for "client" and show my calendar for today
```

---

## Workflows (saved automations)

Workflows are JSON files in `~/Library/Application Support/openMOON/workflows/`.
Execute with: `execute_workflow: morning-briefing`

Example — **morning-briefing.json**:
```json
{
  "name": "Morning Briefing",
  "steps": [
    { "action": "calendar_events", "params": { "days": 1 }, "delay": 0 },
    { "action": "mail_unread", "params": { "limit": 5 }, "delay": 500 },
    { "action": "reminders_list", "params": { "completed": false }, "delay": 500 }
  ]
}
```
