import { useEditor, EditorContent } from '@tiptap/react'
import StarterKit from '@tiptap/starter-kit'
import Placeholder from '@tiptap/extension-placeholder'
import { useEffect } from 'react'

interface MarkdownEditorProps {
  value: string
  onChange: (value: string) => void
  placeholder?: string
}

// Convert Tiptap HTML to simple markdown
function htmlToMarkdown(html: string): string {
  if (!html || html === '<p></p>') return ''

  let markdown = html

  // Headers
  markdown = markdown.replace(/<h1[^>]*>(.*?)<\/h1>/gi, '# $1\n')
  markdown = markdown.replace(/<h2[^>]*>(.*?)<\/h2>/gi, '## $1\n')
  markdown = markdown.replace(/<h3[^>]*>(.*?)<\/h3>/gi, '### $1\n')

  // Lists
  markdown = markdown.replace(/<ul[^>]*>/gi, '')
  markdown = markdown.replace(/<\/ul>/gi, '')
  markdown = markdown.replace(/<li[^>]*><p[^>]*>(.*?)<\/p><\/li>/gi, '- $1\n')
  markdown = markdown.replace(/<li[^>]*>(.*?)<\/li>/gi, '- $1\n')

  // Paragraphs
  markdown = markdown.replace(/<p[^>]*>(.*?)<\/p>/gi, '$1\n')

  // Inline formatting
  markdown = markdown.replace(/<strong[^>]*>(.*?)<\/strong>/gi, '**$1**')
  markdown = markdown.replace(/<em[^>]*>(.*?)<\/em>/gi, '*$1*')
  markdown = markdown.replace(/<code[^>]*>(.*?)<\/code>/gi, '`$1`')

  // Line breaks
  markdown = markdown.replace(/<br\s*\/?>/gi, '\n')

  // Clean up extra newlines
  markdown = markdown.replace(/\n{3,}/g, '\n\n')
  markdown = markdown.trim()

  return markdown
}

// Convert markdown to HTML for Tiptap
function markdownToHtml(markdown: string): string {
  if (!markdown) return '<p></p>'

  const lines = markdown.split('\n')
  const htmlLines: string[] = []
  let inList = false

  for (const line of lines) {
    // Headers
    if (line.startsWith('### ')) {
      if (inList) { htmlLines.push('</ul>'); inList = false }
      htmlLines.push(`<h3>${line.slice(4)}</h3>`)
    } else if (line.startsWith('## ')) {
      if (inList) { htmlLines.push('</ul>'); inList = false }
      htmlLines.push(`<h2>${line.slice(3)}</h2>`)
    } else if (line.startsWith('# ')) {
      if (inList) { htmlLines.push('</ul>'); inList = false }
      htmlLines.push(`<h1>${line.slice(2)}</h1>`)
    }
    // List items
    else if (line.startsWith('- ') || line.startsWith('* ')) {
      if (!inList) { htmlLines.push('<ul>'); inList = true }
      htmlLines.push(`<li><p>${formatInline(line.slice(2))}</p></li>`)
    }
    // Empty lines
    else if (line.trim() === '') {
      if (inList) { htmlLines.push('</ul>'); inList = false }
      // Skip empty lines between blocks
    }
    // Regular paragraphs
    else {
      if (inList) { htmlLines.push('</ul>'); inList = false }
      htmlLines.push(`<p>${formatInline(line)}</p>`)
    }
  }

  if (inList) htmlLines.push('</ul>')

  return htmlLines.join('') || '<p></p>'
}

// Format inline markdown (bold, italic, code)
function formatInline(text: string): string {
  // Bold
  text = text.replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>')
  // Italic
  text = text.replace(/\*(.+?)\*/g, '<em>$1</em>')
  // Code
  text = text.replace(/`(.+?)`/g, '<code>$1</code>')
  return text
}

export function MarkdownEditor({ value, onChange, placeholder }: MarkdownEditorProps) {
  const editor = useEditor({
    extensions: [
      StarterKit.configure({
        heading: {
          levels: [1, 2, 3],
        },
      }),
      Placeholder.configure({
        placeholder: placeholder || 'Start typing...',
        emptyEditorClass: 'is-editor-empty',
      }),
    ],
    content: markdownToHtml(value),
    editorProps: {
      attributes: {
        class: 'markdown-editor-content prose prose-sm dark:prose-invert max-w-none focus:outline-none min-h-full',
      },
    },
    onUpdate: ({ editor }) => {
      const html = editor.getHTML()
      const markdown = htmlToMarkdown(html)
      onChange(markdown)
    },
  })

  // Update editor content when value prop changes externally
  useEffect(() => {
    if (editor && value !== htmlToMarkdown(editor.getHTML())) {
      editor.commands.setContent(markdownToHtml(value))
    }
  }, [value, editor])

  return (
    <div className="markdown-editor h-full">
      <EditorContent editor={editor} className="h-full" />
    </div>
  )
}
