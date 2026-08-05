use serde::{Deserialize, Serialize};

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
pub enum LineEnding {
    Lf,
    Crlf,
}

impl LineEnding {
    #[allow(dead_code)]
    pub fn as_str(&self) -> &'static str {
        match self {
            LineEnding::Lf => "\n",
            LineEnding::Crlf => "\r\n",
        }
    }
}

#[derive(Debug, Clone)]
pub struct FileMetadata {
    pub has_bom: bool,
    pub line_ending: LineEnding,
    pub has_trailing_newline: bool,
}

#[derive(Debug, Clone, PartialEq, Eq)]
pub enum BlockItem {
    EmptyLine,
    Chunk(String),
    CodeBlock(String),
}

/// Parse raw byte data or string into lines, detecting BOM, line endings, and trailing newline.
pub fn parse_file_metadata(content: &str, raw_bytes: &[u8]) -> (FileMetadata, Vec<String>) {
    let has_bom = raw_bytes.starts_with(&[0xEF, 0xBB, 0xBF]);

    let has_crlf = content.contains("\r\n");
    let line_ending = if has_crlf {
        LineEnding::Crlf
    } else {
        LineEnding::Lf
    };

    let has_trailing_newline = content.ends_with('\n') || content.ends_with("\r\n");

    // Normalize LF and split lines
    let normalized = content.replace("\r\n", "\n");
    let mut lines: Vec<String> = normalized.split('\n').map(|s| s.to_string()).collect();

    // If split results in a trailing empty string due to a final newline, pop it so line count reflects real lines
    if has_trailing_newline && lines.last().map_or(false, |l| l.is_empty()) {
        lines.pop();
    }

    (
        FileMetadata {
            has_bom,
            line_ending,
            has_trailing_newline,
        },
        lines,
    )
}

/// Check if a line is considered an empty line (only whitespace or empty).
pub fn is_empty_line(line: &str) -> bool {
    line.trim().is_empty()
}

/// Split a single long non-empty line into multiple sub-lines based on maximum chunk size and delimiters.
pub fn split_long_line(line: &str, max_chunk_size: usize) -> Vec<String> {
    if line.chars().count() <= max_chunk_size {
        return vec![line.to_string()];
    }

    let sentence_ends = ['。', '！', '？', '.', '!', '?'];
    let punctuation_marks = ['、', '，', ',', '；', ';'];

    let mut result = Vec::new();
    let mut current_pos = 0;
    let chars: Vec<char> = line.chars().collect();
    let total_len = chars.len();

    while current_pos < total_len {
        let remaining = total_len - current_pos;
        if remaining <= max_chunk_size {
            let chunk: String = chars[current_pos..].iter().collect();
            result.push(chunk);
            break;
        }

        let window_end = current_pos + max_chunk_size;

        // 1. Try finding best sentence end in window
        let mut split_at = None;
        for idx in (current_pos..window_end).rev() {
            if sentence_ends.contains(&chars[idx]) {
                split_at = Some(idx + 1);
                break;
            }
        }

        // 2. If no sentence end found, try finding best punctuation mark in window
        if split_at.is_none() {
            for idx in (current_pos..window_end).rev() {
                if punctuation_marks.contains(&chars[idx]) {
                    split_at = Some(idx + 1);
                    break;
                }
            }
        }

        // 3. Fallback to forced split at max_chunk_size
        let cut = split_at.unwrap_or(window_end);

        let chunk: String = chars[current_pos..cut].iter().collect();
        result.push(chunk);
        current_pos = cut;
    }

    result
}

/// Generate structured blocks (EmptyLine, Chunk, or CodeBlock) from raw lines.
pub fn build_chunk_blocks(
    lines: &[String],
    granularity: usize,
    max_chunk_size: usize,
) -> Vec<BlockItem> {
    let granularity = if granularity == 0 { 1 } else { granularity };
    let mut blocks = Vec::new();
    let mut current_lines: Vec<String> = Vec::new();
    let mut current_char_count = 0;

    let mut in_code_block = false;
    let mut current_code_block_lines: Vec<String> = Vec::new();

    let flush_current_chunk = |current_lines: &mut Vec<String>,
                               current_char_count: &mut usize,
                               blocks: &mut Vec<BlockItem>| {
        if !current_lines.is_empty() {
            let chunk_text = current_lines.join("\n");
            blocks.push(BlockItem::Chunk(chunk_text));
            current_lines.clear();
            *current_char_count = 0;
        }
    };

    let flush_code_block = |current_code_block_lines: &mut Vec<String>,
                            blocks: &mut Vec<BlockItem>| {
        if !current_code_block_lines.is_empty() {
            let code_text = current_code_block_lines.join("\n");
            blocks.push(BlockItem::CodeBlock(code_text));
            current_code_block_lines.clear();
        }
    };

    let is_fence = |line: &str| {
        let trimmed = line.trim_start();
        // Only 3 backticks (```) or 3 tildes (~~~) start/end a non-translatable code block.
        // 4 or more backticks (e.g. ````) are treated as outer markdown container lines and allowed for translation.
        (trimmed.starts_with("```") && !trimmed.starts_with("````"))
            || (trimmed.starts_with("~~~") && !trimmed.starts_with("~~~~"))
    };

    for raw_line in lines {
        if in_code_block {
            current_code_block_lines.push(raw_line.clone());
            if is_fence(raw_line) {
                flush_code_block(&mut current_code_block_lines, &mut blocks);
                in_code_block = false;
            }
        } else if is_fence(raw_line) {
            flush_current_chunk(&mut current_lines, &mut current_char_count, &mut blocks);
            in_code_block = true;
            current_code_block_lines.push(raw_line.clone());
        } else if is_empty_line(raw_line) {
            // Empty line breaks chunk boundary
            flush_current_chunk(&mut current_lines, &mut current_char_count, &mut blocks);
            blocks.push(BlockItem::EmptyLine);
        } else {
            // Non-empty line. First check if this single line exceeds max_chunk_size
            let sub_lines = split_long_line(raw_line, max_chunk_size);

            for sub_line in sub_lines {
                let sub_len = sub_line.chars().count();

                let extra_char = if current_lines.is_empty() { 0 } else { 1 };
                if (!current_lines.is_empty()
                    && current_char_count + extra_char + sub_len > max_chunk_size)
                    || current_lines.len() >= granularity
                {
                    flush_current_chunk(&mut current_lines, &mut current_char_count, &mut blocks);
                }

                if current_lines.is_empty() {
                    current_lines.push(sub_line);
                    current_char_count = sub_len;
                } else {
                    current_lines.push(sub_line);
                    current_char_count += 1 + sub_len; // +1 for LF
                }
            }
        }
    }

    if in_code_block {
        flush_code_block(&mut current_code_block_lines, &mut blocks);
    } else {
        flush_current_chunk(&mut current_lines, &mut current_char_count, &mut blocks);
    }

    blocks
}

/// Reconstruct raw file bytes from blocks and metadata, preserving BOM and original line endings.
pub fn reconstruct_file(blocks: &[BlockItem], metadata: &FileMetadata) -> Vec<u8> {
    let mut raw_lines = Vec::new();
    for block in blocks {
        match block {
            BlockItem::EmptyLine => raw_lines.push("".to_string()),
            BlockItem::Chunk(content) => raw_lines.push(content.clone()),
            BlockItem::CodeBlock(content) => raw_lines.push(content.clone()),
        }
    }

    let joined = raw_lines.join("\n");
    let line_ending_str = metadata.line_ending.as_str();
    let final_str = if metadata.line_ending == LineEnding::Crlf {
        joined.replace('\n', line_ending_str)
    } else {
        joined
    };

    let mut result = Vec::new();
    if metadata.has_bom {
        result.extend_from_slice(&[0xEF, 0xBB, 0xBF]);
    }
    result.extend_from_slice(final_str.as_bytes());

    if metadata.has_trailing_newline {
        result.extend_from_slice(line_ending_str.as_bytes());
    }

    result
}

pub struct MaskedText {
    pub masked_string: String,
    pub placeholders: Vec<(String, String)>,
}

/// Mask inline code (`code`) and URLs (https://...) with unique placeholders to prevent LLM translation of technical terms
pub fn mask_protected_tokens(text: &str) -> MaskedText {
    let inline_code_re = match regex::Regex::new(r"`[^`\n]+`") {
        Ok(re) => re,
        Err(_) => return MaskedText { masked_string: text.to_string(), placeholders: vec![] },
    };
    let url_re = match regex::Regex::new(r"https?://[^\s)\]]+") {
        Ok(re) => re,
        Err(_) => return MaskedText { masked_string: text.to_string(), placeholders: vec![] },
    };

    let mut placeholders: Vec<(String, String)> = Vec::new();
    let mut masked_string = text.to_string();
    let mut count = 0;

    // 1. Mask inline code
    for cap in inline_code_re.find_iter(text) {
        let orig = cap.as_str().to_string();
        let placeholder = format!("__PROTECTED_{}__", count);
        count += 1;
        placeholders.push((placeholder, orig));
    }

    for (placeholder, orig) in &placeholders {
        masked_string = masked_string.replace(orig.as_str(), placeholder.as_str());
    }

    // 2. Mask URLs
    let temp_string = masked_string.clone();
    for cap in url_re.find_iter(&temp_string) {
        let orig = cap.as_str().to_string();
        if orig.contains("__PROTECTED_") {
            continue;
        }
        let placeholder = format!("__PROTECTED_{}__", count);
        count += 1;
        masked_string = masked_string.replace(orig.as_str(), placeholder.as_str());
        placeholders.push((placeholder, orig));
    }

    MaskedText {
        masked_string,
        placeholders,
    }
}

/// Restore original tokens from placeholders after translation, with fuzzy regex matching for LLM variations (e.g. __PROTECTED_0__, __PROTECTED0__)
pub fn restore_protected_tokens(masked_text: &str, placeholders: &[(String, String)]) -> String {
    if placeholders.is_empty() {
        return masked_text.to_string();
    }

    let mut restored = masked_text.to_string();

    // 1. Exact match replacement
    for (placeholder, orig) in placeholders {
        restored = restored.replace(placeholder, orig);
    }

    // 2. Fuzzy regex replacement if LLM altered the token (e.g. removed underscores, altered spacing or casing)
    if let Ok(fuzzy_re) = regex::Regex::new(r"(?i)__\s*PROTECTED[_\s]*(\d+)\s*__") {
        restored = fuzzy_re
            .replace_all(&restored, |caps: &regex::Captures| {
                if let Some(num_match) = caps.get(1) {
                    if let Ok(idx) = num_match.as_str().parse::<usize>() {
                        if idx < placeholders.len() {
                            return placeholders[idx].1.clone();
                        }
                    }
                }
                caps[0].to_string()
            })
            .to_string();
    }

    restored
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_empty_line_detection() {
        assert!(is_empty_line(""));
        assert!(is_empty_line("   "));
        assert!(is_empty_line("\t"));
        assert!(!is_empty_line("hello"));
    }

    #[test]
    fn test_split_long_line() {
        let text = "これは非常に長い文章です。途中間に読点、が入ります！さらに続きがあります。";
        let sub_lines = split_long_line(text, 15);
        assert!(sub_lines.len() > 1);
        for line in &sub_lines {
            assert!(line.chars().count() <= 15);
        }
    }

    #[test]
    fn test_granularity_and_empty_lines() {
        let lines = vec![
            "Header line".to_string(),
            "".to_string(),
            "Paragraph 1 line 1".to_string(),
            "Paragraph 1 line 2".to_string(),
            "".to_string(),
            "Paragraph 2".to_string(),
        ];

        let blocks = build_chunk_blocks(&lines, 2, 1000);
        assert_eq!(blocks.len(), 5);
        assert_eq!(blocks[0], BlockItem::Chunk("Header line".to_string()));
        assert_eq!(blocks[1], BlockItem::EmptyLine);
        assert_eq!(
            blocks[2],
            BlockItem::Chunk("Paragraph 1 line 1\nParagraph 1 line 2".to_string())
        );
        assert_eq!(blocks[3], BlockItem::EmptyLine);
        assert_eq!(blocks[4], BlockItem::Chunk("Paragraph 2".to_string()));
    }

    #[test]
    fn test_code_block_bypass() {
        let lines = vec![
            "Translate this intro".to_string(),
            "```bash".to_string(),
            "ollama run gemma2".to_string(),
            "echo 'Hello World'".to_string(),
            "```".to_string(),
            "Translate this outro".to_string(),
        ];

        let blocks = build_chunk_blocks(&lines, 1, 1000);
        assert_eq!(blocks.len(), 3);
        assert_eq!(blocks[0], BlockItem::Chunk("Translate this intro".to_string()));
        assert_eq!(
            blocks[1],
            BlockItem::CodeBlock("```bash\nollama run gemma2\necho 'Hello World'\n```".to_string())
        );
        assert_eq!(blocks[2], BlockItem::Chunk("Translate this outro".to_string()));
    }

    #[test]
    fn test_mask_and_restore_protected_tokens() {
        let original = "Run `ollama run gemma2` or check https://example.com for `test` info.";
        let masked = mask_protected_tokens(original);
        assert!(masked.masked_string.contains("__PROTECTED_0__"));
        assert!(masked.masked_string.contains("__PROTECTED_1__"));
        assert!(masked.masked_string.contains("__PROTECTED_2__"));

        let restored = restore_protected_tokens(&masked.masked_string, &masked.placeholders);
        assert_eq!(restored, original);

        // Test fuzzy LLM variations (e.g. missing underscores or case change like __PROTECTED0__)
        // placeholders[0] = `ollama run gemma2`, placeholders[1] = `test`, placeholders[2] = https://example.com
        let llm_altered = "Run __PROTECTED0__ or check __protected 2__ for __PROTECTED_1__ info.";
        let fuzzy_restored = restore_protected_tokens(llm_altered, &masked.placeholders);
        assert_eq!(fuzzy_restored, original);
    }

    #[test]
    fn test_four_backticks_nested_markdown() {
        let lines = vec![
            "````".to_string(),
            "# sample header".to_string(),
            "".to_string(),
            "this is sample code".to_string(),
            "".to_string(),
            "```bash".to_string(),
            "sample command".to_string(),
            "```".to_string(),
            "````".to_string(),
        ];

        let blocks = build_chunk_blocks(&lines, 1, 1000);
        // ```` and `# sample header` and `this is sample code` are Chunks for translation,
        // while ```bash ... ``` is a protected CodeBlock
        let code_blocks: Vec<&BlockItem> = blocks.iter().filter(|b| matches!(b, BlockItem::CodeBlock(_))).collect();
        assert_eq!(code_blocks.len(), 1);
        if let BlockItem::CodeBlock(ref content) = code_blocks[0] {
            assert_eq!(content, "```bash\nsample command\n```");
        }
    }
}
