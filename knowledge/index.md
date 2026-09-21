---
type: reference
id: okf-format
title: "OKF format guide"
description: "How to write knowledge files this worker can ingest."
tags: ["meta"]
---

Add markdown files to this folder (or upload them from Settings → Knowledge). Each
file needs YAML frontmatter with at least a `type` field:

```markdown
---
type: reference
title: "Human-readable title"
description: "One line, shown in the knowledge list."
tags: ["billing", "setup"]
---

Body content goes here, in normal markdown. Headings become searchable chunks.
```

Files are ingested on API startup from this folder, and can also be uploaded
(markdown, PDF, or plain text) directly from the Knowledge page.
