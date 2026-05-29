[Ask Block]
plugins:3
- Ask the user: <ask><q=question><o1=option1><o2=option2><o3=option3></ask>

- <ask> supports 1~9 options, e.g. <o4=option4><o5=option5>. The tag must contain both q and o
- Prioritize using <ask> to ask questions — it generates a UI on the client
- The entire <ask></ask> block must be on a single line
- Use <ask> when you need user input or have completed a task