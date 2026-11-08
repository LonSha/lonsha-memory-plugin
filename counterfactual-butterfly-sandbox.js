/* ============================================================
 * counterfactual-butterfly-sandbox.js — [v3.460.0 · V21-L7]
 * 反事实沙盒防火墙正史隔离与分支演化沙盘 (Counterfactual Butterfly Sandbox)
 * ------------------------------------------------------------
 * 1. 物理隔离推演分支（Forked In-Memory World Sandbox）
 * 2. 蝴蝶效应级联推演（Hypothetical Butterfly Ripple Engine）
 * 3. 一键安全试算与零正史污染回退（Safe Rollback Guarantee）
 * ============================================================ */
(function (root, factory) {
    if (typeof define === "function" && define.amd) {
        define([], factory);
    } else if (typeof module === "object" && module.exports) {
        module.exports = factory();
    } else {
        root.LonShaCounterfactualSandbox = factory();
        root.CounterfactualButterflySandbox = root.LonShaCounterfactualSandbox;
    }
}(typeof globalThis !== "undefined" ? globalThis : this, function () {
    "use strict";
    const VERSION = "3.460.0";

    function createSandboxState() {
        return {
            version: VERSION,
            activeSandboxes: new Map(), // sandboxId -> { baseSnapshot, mutations, divergentEffects }
            updatedAt: Date.now()
        };
    }

    function forkHypotheticalSandbox(state, baselineSnapshot = {}) {
        if (!state || !state.activeSandboxes) return null;
        const sandboxId = `sb_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`;
        const sandbox = {
            sandboxId,
            baseSnapshot: JSON.parse(JSON.stringify(baselineSnapshot || {})),
            mutations: [],
            divergentEffects: [],
            createdAt: Date.now()
        };
        state.activeSandboxes.set(sandboxId, sandbox);
        state.updatedAt = Date.now();
        return sandbox;
    }

    function applyCounterfactualMutation(state, sandboxId, mutation = {}) {
        if (!state || !state.activeSandboxes) return false;
        const sb = state.activeSandboxes.get(sandboxId);
        if (!sb) return false;
        const entry = {
            id: `mut_${Date.now()}`,
            hypotheticalAction: String(mutation.action || ""),
            divergentOutcome: String(mutation.outcome || ""),
            rippleEffect: String(mutation.rippleEffect || ""),
            appliedAt: Date.now()
        };
        sb.mutations.push(entry);
        sb.divergentEffects.push(entry.divergentOutcome);
        state.updatedAt = Date.now();
        return true;
    }

    function discardSandbox(state, sandboxId) {
        if (!state || !state.activeSandboxes) return false;
        const res = state.activeSandboxes.delete(sandboxId);
        state.updatedAt = Date.now();
        return res;
    }

    return {
        VERSION,
        createSandboxState,
        forkHypotheticalSandbox,
        applyCounterfactualMutation,
        discardSandbox
    };
}));
