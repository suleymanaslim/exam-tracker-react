with open("src/pages/VideoPlan.tsx", "r") as f:
    content = f.read()

import re

content = re.sub(
    r"import \{[^}]*\} from 'lucide-react'",
    "import { Plus, Trash2, Download, Image as ImageIcon, Settings, EyeOff, SkipForward, X, Check, ChevronUp, ChevronDown } from 'lucide-react'",
    content,
    flags=re.DOTALL
)

content = re.sub(
    r"import \{ AnimatePresence, motion \} from 'framer-motion'\n?",
    "",
    content
)

with open("src/pages/VideoPlan.tsx", "w") as f:
    f.write(content)
