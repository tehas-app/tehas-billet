use napi_derive::napi;

#[napi]
pub fn word_count(text: String) -> u32 {
    text.split_whitespace().count() as u32
}

#[cfg(test)]
mod tests {
    use super::word_count;

    #[test]
    fn counts_words_split_by_any_whitespace() {
        assert_eq!(word_count("ship  it\tnow\n".to_string()), 3);
    }

    #[test]
    fn counts_no_words_in_blank_text() {
        assert_eq!(word_count("   ".to_string()), 0);
    }
}
