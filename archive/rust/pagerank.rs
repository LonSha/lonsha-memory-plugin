// Phase 6: Rust WASM 模块 - PageRank 算法
// 编译命令: wasm-pack build --target web

use wasm_bindgen::prelude::*;
use std::collections::HashMap;
use serde::{Deserialize, Serialize};

#[wasm_bindgen]
extern "C" {
    #[wasm_bindgen(js_namespace = console)]
    fn log(s: &str);
}

// 节点结构
#[derive(Serialize, Deserialize, Clone)]
pub struct Node {
    pub id: String,
    pub name: String,
    #[serde(rename = "type")]
    pub node_type: String,
}

// 边结构
#[derive(Serialize, Deserialize, Clone)]
pub struct Edge {
    pub from: String,
    pub to: String,
    pub weight: f64,
}

// PageRank 配置
#[derive(Serialize, Deserialize)]
pub struct PageRankConfig {
    pub damping_factor: f64,
    pub max_iterations: usize,
    pub tolerance: f64,
}

impl Default for PageRankConfig {
    fn default() -> Self {
        PageRankConfig {
            damping_factor: 0.85,
            max_iterations: 30,
            tolerance: 1e-6,
        }
    }
}

// PageRank 计算器
#[wasm_bindgen]
pub struct PageRankCalculator {
    nodes: Vec<Node>,
    edges: Vec<Edge>,
    config: PageRankConfig,
}

#[wasm_bindgen]
impl PageRankCalculator {
    #[wasm_bindgen(constructor)]
    pub fn new(nodes_json: &str, edges_json: &str, config_json: Option<String>) -> Result<PageRankCalculator, JsValue> {
        let nodes: Vec<Node> = serde_json::from_str(nodes_json)
            .map_err(|e| JsValue::from_str(&format!("Failed to parse nodes: {}", e)))?;
        
        let edges: Vec<Edge> = serde_json::from_str(edges_json)
            .map_err(|e| JsValue::from_str(&format!("Failed to parse edges: {}", e)))?;
        
        let config = if let Some(cfg) = config_json {
            serde_json::from_str(&cfg)
                .map_err(|e| JsValue::from_str(&format!("Failed to parse config: {}", e)))?
        } else {
            PageRankConfig::default()
        };
        
        Ok(PageRankCalculator { nodes, edges, config })
    }
    
    // 计算 PageRank（优化版本）
    #[wasm_bindgen]
    pub fn calculate(&self) -> Result<String, JsValue> {
        let start = js_sys::Date::now();
        
        let n = self.nodes.len();
        if n == 0 {
            return Ok("{}".to_string());
        }
        
        // 初始化 ranks
        let mut ranks: HashMap<String, f64> = HashMap::new();
        let initial_rank = 1.0 / n as f64;
        for node in &self.nodes {
            ranks.insert(node.id.clone(), initial_rank);
        }
        
        // 构建邻接表和出度表
        let mut out_links: HashMap<String, Vec<(String, f64)>> = HashMap::new();
        let mut in_links: HashMap<String, Vec<(String, f64)>> = HashMap::new();
        let mut out_degree: HashMap<String, usize> = HashMap::new();
        
        for node in &self.nodes {
            out_links.insert(node.id.clone(), Vec::new());
            in_links.insert(node.id.clone(), Vec::new());
            out_degree.insert(node.id.clone(), 0);
        }
        
        for edge in &self.edges {
            if let Some(links) = out_links.get_mut(&edge.from) {
                links.push((edge.to.clone(), edge.weight));
            }
            if let Some(links) = in_links.get_mut(&edge.to) {
                links.push((edge.from.clone(), edge.weight));
            }
            *out_degree.entry(edge.from.clone()).or_insert(0) += 1;
        }
        
        // 迭代计算
        let mut prev_diff = f64::INFINITY;
        let mut stable_count = 0;
        
        for iteration in 0..self.config.max_iterations {
            let mut new_ranks: HashMap<String, f64> = HashMap::new();
            let mut diff = 0.0;
            
            for node in &self.nodes {
                let node_id = &node.id;
                let mut rank = (1.0 - self.config.damping_factor) / n as f64;
                
                if let Some(incoming) = in_links.get(node_id) {
                    for (from_id, weight) in incoming {
                        let from_rank = ranks.get(from_id).unwrap_or(&0.0);
                        let degree = *out_degree.get(from_id).unwrap_or(&1).max(&1);
                        rank += self.config.damping_factor * (from_rank / degree as f64) * weight;
                    }
                }
                
                let old_rank = ranks.get(node_id).unwrap_or(&0.0);
                diff += (rank - old_rank).abs();
                new_ranks.insert(node_id.clone(), rank);
            }
            
            ranks = new_ranks;
            
            // 自适应收敛检测
            if diff < self.config.tolerance {
                if diff < prev_diff * 0.5 {
                    stable_count += 1;
                } else {
                    stable_count = 0;
                }
                
                if stable_count >= 3 {
                    log(&format!("Converged at iteration {} with diff {}", iteration, diff));
                    break;
                }
            }
            prev_diff = diff;
            
            if diff < self.config.tolerance {
                break;
            }
        }
        
        let elapsed = js_sys::Date::now() - start;
        log(&format!("WASM PageRank completed in {:.2}ms", elapsed));
        
        // 序列化结果
        serde_json::to_string(&ranks)
            .map_err(|e| JsValue::from_str(&format!("Failed to serialize result: {}", e)))
    }
    
    // 计算 Top-K 节点
    #[wasm_bindgen]
    pub fn top_k(&self, ranks_json: &str, k: usize) -> Result<String, JsValue> {
        let ranks: HashMap<String, f64> = serde_json::from_str(ranks_json)
            .map_err(|e| JsValue::from_str(&format!("Failed to parse ranks: {}", e)))?;
        
        let mut sorted: Vec<(String, f64)> = ranks.into_iter().collect();
        sorted.sort_by(|a, b| b.1.partial_cmp(&a.1).unwrap());
        
        let top: Vec<(String, f64)> = sorted.into_iter().take(k).collect();
        
        serde_json::to_string(&top)
            .map_err(|e| JsValue::from_str(&format!("Failed to serialize top-k: {}", e)))
    }
}

// 批量 PageRank 计算（并行优化）
#[wasm_bindgen]
pub fn batch_pagerank(
    nodes_json: &str,
    edges_json: &str,
    configs_json: &str,
) -> Result<String, JsValue> {
    let nodes: Vec<Node> = serde_json::from_str(nodes_json)
        .map_err(|e| JsValue::from_str(&format!("Failed to parse nodes: {}", e)))?;
    
    let edges: Vec<Edge> = serde_json::from_str(edges_json)
        .map_err(|e| JsValue::from_str(&format!("Failed to parse edges: {}", e)))?;
    
    let configs: Vec<PageRankConfig> = serde_json::from_str(configs_json)
        .map_err(|e| JsValue::from_str(&format!("Failed to parse configs: {}", e)))?;
    
    let mut results = Vec::new();
    
    for config in configs {
        let calculator = PageRankCalculator { 
            nodes: nodes.clone(), 
            edges: edges.clone(), 
            config 
        };
        
        let result = calculator.calculate()?;
        results.push(result);
    }
    
    serde_json::to_string(&results)
        .map_err(|e| JsValue::from_str(&format!("Failed to serialize batch results: {}", e)))
}

// 增量 PageRank 更新（WASM 优化版本）
#[wasm_bindgen]
pub fn incremental_pagerank(
    current_ranks_json: &str,
    nodes_json: &str,
    edges_json: &str,
    new_nodes_json: &str,
    new_edges_json: &str,
    config_json: Option<String>,
) -> Result<String, JsValue> {
    let mut ranks: HashMap<String, f64> = serde_json::from_str(current_ranks_json)
        .map_err(|e| JsValue::from_str(&format!("Failed to parse current ranks: {}", e)))?;
    
    let nodes: Vec<Node> = serde_json::from_str(nodes_json)
        .map_err(|e| JsValue::from_str(&format!("Failed to parse nodes: {}", e)))?;
    
    let edges: Vec<Edge> = serde_json::from_str(edges_json)
        .map_err(|e| JsValue::from_str(&format!("Failed to parse edges: {}", e)))?;
    
    let new_nodes: Vec<Node> = serde_json::from_str(new_nodes_json)
        .map_err(|e| JsValue::from_str(&format!("Failed to parse new nodes: {}", e)))?;
    
    let new_edges: Vec<Edge> = serde_json::from_str(new_edges_json)
        .map_err(|e| JsValue::from_str(&format!("Failed to parse new edges: {}", e)))?;
    
    let config: PageRankConfig = if let Some(cfg) = config_json {
        serde_json::from_str(&cfg)
            .map_err(|e| JsValue::from_str(&format!("Failed to parse config: {}", e)))?
    } else {
        PageRankConfig::default()
    };
    
    // 收集受影响的节点
    let mut affected: std::collections::HashSet<String> = std::collections::HashSet::new();
    
    for node in &new_nodes {
        affected.insert(node.id.clone());
    }
    
    for edge in &new_edges {
        affected.insert(edge.from.clone());
        affected.insert(edge.to.clone());
        
        // 添加邻居节点
        for e in &edges {
            if e.from == edge.from || e.to == edge.from {
                affected.insert(e.from.clone());
                affected.insert(e.to.clone());
            }
            if e.from == edge.to || e.to == edge.to {
                affected.insert(e.from.clone());
                affected.insert(e.to.clone());
            }
        }
    }
    
    let n = nodes.len();
    
    // 只更新受影响的节点（减少迭代次数到 10）
    for _ in 0..10 {
        let mut new_ranks = ranks.clone();
        
        for node_id in &affected {
            let mut rank = (1.0 - config.damping_factor) / n as f64;
            
            // 计算入链贡献
            for edge in &edges {
                if edge.to == *node_id {
                    let from_rank = ranks.get(&edge.from).unwrap_or(&0.0);
                    let out_degree = edges.iter()
                        .filter(|e| e.from == edge.from)
                        .count()
                        .max(1);
                    rank += config.damping_factor * (from_rank / out_degree as f64) * edge.weight;
                }
            }
            
            new_ranks.insert(node_id.clone(), rank);
        }
        
        ranks = new_ranks;
    }
    
    serde_json::to_string(&ranks)
        .map_err(|e| JsValue::from_str(&format!("Failed to serialize result: {}", e)))
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_pagerank_simple() {
        let nodes = vec![
            Node { id: "A".to_string(), name: "Node A".to_string(), node_type: "test".to_string() },
            Node { id: "B".to_string(), name: "Node B".to_string(), node_type: "test".to_string() },
            Node { id: "C".to_string(), name: "Node C".to_string(), node_type: "test".to_string() },
        ];
        
        let edges = vec![
            Edge { from: "A".to_string(), to: "B".to_string(), weight: 1.0 },
            Edge { from: "B".to_string(), to: "C".to_string(), weight: 1.0 },
            Edge { from: "C".to_string(), to: "A".to_string(), weight: 1.0 },
        ];
        
        let nodes_json = serde_json::to_string(&nodes).unwrap();
        let edges_json = serde_json::to_string(&edges).unwrap();
        
        let calculator = PageRankCalculator::new(&nodes_json, &edges_json, None).unwrap();
        let result = calculator.calculate().unwrap();
        
        let ranks: HashMap<String, f64> = serde_json::from_str(&result).unwrap();
        
        // 在环形图中，所有节点的 PageRank 应该相等
        let rank_a = ranks.get("A").unwrap();
        let rank_b = ranks.get("B").unwrap();
        let rank_c = ranks.get("C").unwrap();
        
        assert!((rank_a - rank_b).abs() < 0.01);
        assert!((rank_b - rank_c).abs() < 0.01);
        assert!((rank_a - 0.333).abs() < 0.01); // 约 1/3
    }
}
