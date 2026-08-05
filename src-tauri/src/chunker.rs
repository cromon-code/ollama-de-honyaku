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

/// Generate structured blocks (EmptyLine or Chunk) from raw lines.
pub fn build_chunk_blocks(
    lines: &[String],
    granularity: usize,
    max_chunk_size: usize,
) -> Vec<BlockItem> {
    let granularity = if granularity == 0 { 1 } else { granularity };
    let mut blocks = Vec::new();
    let mut current_lines: Vec<String> = Vec::new();
    let mut current_char_count = 0;

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

    for raw_line in lines {
        if is_empty_line(raw_line) {
            // Empty line breaks chunk boundary
            flush_current_chunk(&mut current_lines, &mut current_char_count, &mut blocks);
            blocks.push(BlockItem::EmptyLine);
        } else {
            // Non-empty line. First check if this single line exceeds max_chunk_size
            let sub_lines = split_long_line(raw_line, max_chunk_size);

            for sub_line in sub_lines {
                let sub_len = sub_line.chars().count();

                // If adding sub_line (plus newline if current_lines not empty) exceeds max_chunk_size OR granularity reached
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

    flush_current_chunk(&mut current_lines, &mut current_char_count, &mut blocks);
    blocks
}

/// Reconstruct full file content from translated blocks, applying line ending, BOM, and trailing newline.
pub fn reconstruct_file(
    blocks: &[BlockItem],
    metadata: &FileMetadata,
) -> Vec<u8> {
    let mut result_string = String::new();

    for (i, block) in blocks.iter().enumerate() {
        if i > 0 {
            result_string.push_str("\n");
        }
        match block {
            BlockItem::EmptyLine => {
                // Empty line is represented as empty string between newlines
            }
            BlockItem::Chunk(content) => {
                result_string.push_str(content);
            }
        }
    }

    if metadata.has_trailing_newline {
        result_string.push('\n');
    }

    // Convert LF to CRLF if original file was CRLF
    let final_str = if metadata.line_ending == LineEnding::Crlf {
        result_string.replace('\n', "\r\n")
    } else {
        result_string
    };

    let mut bytes = Vec::new();
    if metadata.has_bom {
        bytes.extend_from_slice(&[0xEF, 0xBB, 0xBF]);
    }
    bytes.extend_from_slice(final_str.as_bytes());
    bytes
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_empty_line_detection() {
        assert!(is_empty_line(""));
        assert!(is_empty_line(" "));
        assert!(is_empty_line("\t"));
        assert!(is_empty_line(" \t "));
        assert!(!is_empty_line(" a "));
    }

    #[test]
    fn test_granularity_and_empty_lines() {
        let input = vec![
            "A".into(),
            "B".into(),
            "".into(),
            "C".into(),
            "D".into(),
        ];
        let blocks = build_chunk_blocks(&input, 10, 3000);
        assert_eq!(
            blocks,
            vec![
                BlockItem::Chunk("A\nB".into()),
                BlockItem::EmptyLine,
                BlockItem::Chunk("C\nD".into()),
            ]
        );
    }

    #[test]
    fn test_split_long_line() {
        let line = "これは長い文です。ここで切れるはず！さらに続く文章。";
        let parts = split_long_line(line, 12);
        assert_eq!(parts, vec!["これは長い文です。", "ここで切れるはず！", "さらに続く文章。"]);
    }
}
