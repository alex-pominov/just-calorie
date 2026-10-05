# component-sheet

A development surface, not product UI: `app/index.tsx` renders every component-sheet primitive in
every Figma variant (frame `5:2520`) under a caption, so each can be checked against its Figma node on
a running build.

- **Owns:** the captioned section the sheet is laid out with.
- **Who may depend on it:** only the component-sheet route. Nothing in the product imports it.
- **Constraints:** it is deleted when the main-screen workstream replaces `app/index.tsx`.
