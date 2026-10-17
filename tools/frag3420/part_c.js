/* ══════════════════════════════════════════════════════════════════════
     * [v3.342.0 · M4-X3] **落卷面自证探针**（接在 selfCheck 的返回对象里）
     *
     * 每一条都是**真探针**：吃真夹具、跑真函数、读真返回值。
     *   不是为了「有个字段叫 true」，而是为了让「形状断链 / 三态混同 / 幂等失效」
     *   这三种坏法各有**一个可机检的现场**——修前它们全都表现为「读数全绿」。
     * ══════════════════════════════════════════════════════════════════════ */
    /** 落卷面夹具：两条终结声明（各带一条带面归属的条文）+ 一条缺格条文 + 一条无位条文。 */
    function adoptProbeDeps() {
        return {
            BRANCH_OUTCOMES: [
                { branch: 'b1', collision: 'k1', terminal: true, value: 'A', items: [{ key: 'q1', face: 'unfinished', entityId: 'c1', value: '等她回来', floor: 3 }] },
                { branch: 'b2', collision: 'k1', terminal: true, value: 'B', items: [{ key: 'q1', face: 'unfinished', entityId: 'c1', value: '她没回来', floor: 9, secret: 'hidden' }] },
                { branch: 'b1', collision: 'k2', terminal: true, value: 'C', items: [{ key: 'q2', face: 'unfinished', entityId: 'c2', value: 'x' }] },
                { branch: 'b1', collision: 'k3', terminal: true, value: 'D', items: [{ key: 'q3', value: 'no-face-no-owner' }] },
                { branch: 'b2', value: 'E' },
            ],
            CONFIRMED_FACTS: {},
            SECRET_BODY_KEYS: ['secret', 'secretText', 'secretBody'],
        };
    }
    /** 一次选尽 k1/k2/k3 的计划（落卷面探针与用例共用同一份构造法）。 */
    function adoptProbePlan() {
        let p = setDecision(null, { key: 'k1', decision: DECISION.CANON, branch: 'b1', note: '选 b1' }).plan;
        p = setDecision(p, { key: 'k2', decision: DECISION.EXCLUDE, branch: '' }).plan;
        p = setDecision(p, { key: 'k3', decision: DECISION.COEXIST, branch: '' }).plan;
        return p;
    }