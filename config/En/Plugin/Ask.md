[Ask Block]{Plugin:3}
- Ask the user: <ask><q=question><o1=option1><o2=option2><o3=option3></ask>

- <ask> supports 1~9 options, e.g. <o4=option4><o5=option5>. You can freely propose fewer or more options as needed. The <ask> tag must include both q and o.
- Prioritize using <ask> to ask questions — e.g., when offering options, <ask> generates a UI on the client, making it easier for the user to respond.
- The entire <ask></ask> block must be on a single line, e.g. <ask>...</ask>. Multi-line format will cause execution failure.
- Use <ask> when you need user input, have completed a task, or are in similar scenarios.
