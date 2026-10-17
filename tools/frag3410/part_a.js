    /* ────────────────────────────────────────────────────────────
     * [v3.341.0 · M4-X2] **成稿面** —— 从真实剧情生成可编辑的章节回顾
     *
     * 【它补的是哪一格（M4-X2 验收原文逐条）】
     *   本模块修前只做两件事：**按章提取四要素**（build/review）与**只报读数的词表面**
     *   （belletristic 统计八股味，**不改写一个字**）。验收原文要的是「从真实剧情生成
     *   **可编辑的章节回顾**」。修前实测三处缺口（不是「再加一个按钮」）：
     *     1 **没有成稿** —— 四要素是结构、不是可读的回顾；没有一处「一段一段跳回原文」的成稿；
     *     2 **没有按章重建** —— 改一章源文 ⇒ 修前只能整本重来（或什么也不做），
     *       「重建**受影响**章节而非整本重写」无处可读；
     *     3 **没调模型不许说通过** —— 此前不区分「离线结构成稿」与「过了真实模型」，
     *       读者会把前者读成后者（本仓治过多轮的「声称与落地漂移」同族）。
     *   ★ 与 belletristic 分工不同：belletristic 答「这段有几处八股味」，
     *     compose 答「这一章的回顾长什么样、每一段能否跳回原文」。
     *   ★ 本面**不写记忆库**：成稿落在**草稿**上（applyEdits 只管草稿，事实位出现即拒）。
     */
    /** 成稿段落类（**穷尽**）：一段 = 一句可读文本 + 一个证据位。 */
    const SECTION_KINDS = Object.freeze(['title', 'summary', 'event', 'change', 'unfinished', 'quote']);
    const SECTION_LABEL = Object.freeze({ title: '章题', summary: '章述', event: '关键事件', change: '人物变化', unfinished: '未了事项', quote: '精选原话' });
    /** 成稿来源两态（**不得同形**）：未调真实模型 ⇒ structure-only 且 styleChecked:false。 */
    const COMPOSE_SOURCES = Object.freeze(['structure-only', 'polished']);
    /** 章身份串（同一处拼法；两边各拼一份必然漂移）。 */
    function chapterKey(ref) {
        const r = (ref && typeof ref === 'object') ? ref : {};
        return keyOf(r.project) + '/' + keyOf(r.volume) + '/' + keyOf(r.chapter);
    }
    /** 成稿段落：一段 = 可读文本 + **一个证据位**（逐段可回源）。 */
    function sectionOf(kind, text, ref, floor, chars, max) {
        const t = strOf(text).replace(/^[\s:：-]+/, '').trim();
        if (!t) return null;
        return {
            kind: kind, label: SECTION_LABEL[kind] || kind, text: clip(t, max || 400),
            evidenceRef: keyOf(ref), floor: numOr(floor, 0), chars: arrOf(chars).map(keyOf).filter(Boolean),
        };
    }
    /** 草稿册形态串（与 SA_KIND 分列：回顾是读数，草稿册是**作品**）。 */
    const DRAFT_KIND = 'story_annual_drafts';
