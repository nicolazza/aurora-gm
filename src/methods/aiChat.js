/**
 * AI Chat Methods
 * Handles the floating AI assistant chat panel.
 */

import { pb } from '../config.js'
import DOMPurify from 'dompurify'

const APP_ID = 'gm'

// ── Toggle panel ────────────────────────────────────────

export function toggleAiChat() {
    this.aiChatOpen = !this.aiChatOpen
    if (this.aiChatOpen && !this.aiChatLoaded && this.isAuthenticated) {
        this.loadAiConversation()
    }
    if (this.aiChatOpen) {
        this.$nextTick(() => {
            const el = document.getElementById('ai-chat-input')
            if (el) el.focus()
        })
    }
}

// ── Load existing conversation ──────────────────────────

export async function loadAiConversation() {
    if (!this.isAuthenticated) return
    this.aiChatLoaded = true
    try {
        const userId = pb.authStore.model?.id
        if (!userId) return
        const result = await pb.collection('ai_conversations').getList(1, 1, {
            filter: `user = "${userId}" && app = "${APP_ID}"`
        })
        if (result.items.length > 0) {
            const record = result.items[0]
            const msgs = record.messages
            this.aiChatRecordId = record.id
            this.aiChatMessages = Array.isArray(msgs) ? msgs : []
            this.$nextTick(() => this.scrollAiChat())
        }
    } catch (err) {
        console.warn('AI Chat: failed to load conversation', err)
    }
}

// ── Send message ────────────────────────────────────────

export async function sendAiMessage() {
    const text = (this.aiChatInput || '').trim()
    if (!text || this.aiChatLoading) return

    const userMsg = {
        role: 'user',
        content: text,
        timestamp: new Date().toISOString()
    }

    this.aiChatMessages.push(userMsg)
    this.aiChatInput = ''
    this.aiChatLoading = true
    this.$nextTick(() => this.scrollAiChat())

    try {
        const payload = this.aiChatMessages.map(m => ({
            role: m.role,
            content: m.content
        }))

        const res = await pb.send('/api/aurora/chat', {
            method: 'POST',
            body: JSON.stringify({ messages: payload }),
            headers: { 'Content-Type': 'application/json' }
        })

        const assistantMsg = {
            role: 'assistant',
            content: res.reply || '',
            timestamp: new Date().toISOString()
        }
        this.aiChatMessages.push(assistantMsg)
        this.saveAiConversation()
    } catch (err) {
        const errMsg = err?.message || 'Something went wrong'
        this.aiChatMessages.push({
            role: 'assistant',
            content: `Sorry, I encountered an error: ${errMsg}`,
            timestamp: new Date().toISOString()
        })
    } finally {
        this.aiChatLoading = false
        this.$nextTick(() => this.scrollAiChat())
    }
}

// ── Persist conversation ────────────────────────────────

export async function saveAiConversation() {
    if (!this.isAuthenticated) return
    const userId = pb.authStore.model?.id
    if (!userId) return

    try {
        if (this.aiChatRecordId) {
            await pb.collection('ai_conversations').update(this.aiChatRecordId, {
                messages: this.aiChatMessages
            })
        } else {
            const record = await pb.collection('ai_conversations').create({
                user: userId,
                app: APP_ID,
                messages: this.aiChatMessages
            })
            this.aiChatRecordId = record.id
        }
    } catch (err) {
        console.warn('AI Chat: failed to save conversation', err)
    }
}

// ── New chat ────────────────────────────────────────────

export async function clearAiConversation() {
    if (this.aiChatRecordId) {
        try {
            await pb.collection('ai_conversations').delete(this.aiChatRecordId)
        } catch (err) {
            console.warn('AI Chat: failed to delete conversation', err)
        }
    }
    this.aiChatMessages = []
    this.aiChatRecordId = null
    this.$nextTick(() => {
        const el = document.getElementById('ai-chat-input')
        if (el) el.focus()
    })
}

// ── Scroll helper ───────────────────────────────────────

export function scrollAiChat() {
    const container = document.getElementById('ai-chat-messages')
    if (container) {
        container.scrollTop = container.scrollHeight
    }
}

// ── Markdown → HTML (bold, italic, code, lists, headings) ─

export function formatAiMessage(text) {
    if (!text) return ''
    // Escape HTML
    let html = text
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')

    // Process line by line
    const lines = html.split('\n')
    const result = []
    let inList = false

    for (let i = 0; i < lines.length; i++) {
        let line = lines[i]

        // Blank line
        if (line.trim() === '') {
            if (inList) { result.push('</div>'); inList = false }
            result.push('<br/>')
            continue
        }

        // Heading (### text) → bold
        const headingMatch = line.match(/^#{1,4}\s+(.*)/)
        if (headingMatch) {
            if (inList) { result.push('</div>'); inList = false }
            result.push('<strong>' + inlineFormat(headingMatch[1]) + '</strong><br/>')
            continue
        }

        // Bullet list (- or •)
        const bulletMatch = line.match(/^\s*[-•]\s+(.*)/)
        if (bulletMatch) {
            if (!inList) { result.push('<div class="ai-md-list">'); inList = true }
            result.push('<div class="ai-md-li"><span class="ai-md-bullet">•</span><span>' + inlineFormat(bulletMatch[1]) + '</span></div>')
            continue
        }

        // Numbered list (1. or 1))
        const numMatch = line.match(/^\s*(\d+)[.)]\s+(.*)/)
        if (numMatch) {
            if (!inList) { result.push('<div class="ai-md-list">'); inList = true }
            result.push('<div class="ai-md-li"><span class="ai-md-num">' + numMatch[1] + '.</span><span>' + inlineFormat(numMatch[2]) + '</span></div>')
            continue
        }

        // Normal line
        if (inList) { result.push('</div>'); inList = false }
        if (i > 0 && lines[i - 1].trim() !== '') result.push('<br/>')
        result.push(inlineFormat(line))
    }

    if (inList) result.push('</div>')
    return DOMPurify.sanitize(result.join(''))

    function inlineFormat(str) {
        // Inline code
        str = str.replace(/`([^`]+)`/g, '<code class="ai-md-code">$1</code>')
        // Bold
        str = str.replace(/\*\*((?:(?!\*\*).)+)\*\*/g, '<strong>$1</strong>')
        // Italic
        str = str.replace(/\*((?:(?!\*).)+)\*/g, '<em>$1</em>')
        return str
    }
}

// ── Key handler (Enter to send, Shift+Enter for newline) ─

export function aiChatKeydown(e) {
    if (e.key === 'Enter' && !e.shiftKey) {
        e.preventDefault()
        this.sendAiMessage()
    }
}
