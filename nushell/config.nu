# Nushell Configuration File
# See full configuration reference at: https://www.nushell.sh/book/configuration.html

# Environment configuration is in env.nu
# This file contains settings and customizations

# Shell configuration
$env.config = {
    show_banner: false
    edit_mode: emacs
    
    # History configuration
    history: {
        max_size: 100_000
        sync_on_enter: true
        file_format: "plaintext"
        isolation: false
    }
    
    # Completion configuration
    completions: {
        case_sensitive: false
        quick: true
        partial: true
        algorithm: "prefix"
        external: {
            enable: true
            max_results: 100
            completer: null
        }
    }
    
    # Table configuration
    table: {
        mode: rounded
        index_mode: always
        show_empty: true
        padding: { left: 1, right: 1 }
        trim: {
            methodology: wrapping
            wrapping_try_keep_words: true
            truncating_suffix: "..."
        }
    }
    
    # File listing configuration
    ls: {
        use_ls_colors: true
        clickable_links: true
    }
    
    # Key bindings
    keybindings: [
        {
            name: completion_menu
            modifier: none
            keycode: tab
            mode: [emacs vi_normal vi_insert]
            event: {
                until: [
                    { send: menu name: completion_menu }
                    { send: menunext }
                    { edit: complete }
                ]
            }
        }
    ]
    
    # Hooks
    hooks: {
        pre_prompt: []
        pre_execution: []
        env_change: {
            PWD: [
                {|before, after| 
                    # Add your PWD change hooks here
                }
            ]
        }
    }
    
    # Color configuration
    color_config: {
        separator: white
        leading_trailing_space_bg: { attr: n }
        header: green_bold
        empty: blue
        bool: light_cyan
        int: white
        filesize: cyan
        duration: white
        date: purple
        range: white
        float: white
        string: white
        nothing: white
        binary: white
        cell-path: white
        row_index: green_bold
        record: white
        list: white
        block: white
        hints: dark_gray
        search_result: {bg: red fg: white}
        shape_and: purple_bold
        shape_binary: purple_bold
        shape_block: blue_bold
        shape_bool: light_cyan
        shape_closure: green_bold
        shape_custom: green
        shape_datetime: cyan_bold
        shape_directory: cyan
        shape_external: cyan
        shape_externalarg: green_bold
        shape_filepath: cyan
        shape_flag: blue_bold
        shape_float: purple_bold
        shape_garbage: { fg: white bg: red attr: b}
        shape_globpattern: cyan_bold
        shape_int: purple_bold
        shape_internalcall: cyan_bold
        shape_list: cyan_bold
        shape_literal: blue
        shape_match_pattern: green
        shape_matching_brackets: { attr: u }
        shape_nothing: light_cyan
        shape_operator: yellow
        shape_or: purple_bold
        shape_pipe: purple_bold
        shape_range: yellow_bold
        shape_record: cyan_bold
        shape_redirection: purple_bold
        shape_signature: green_bold
        shape_string: green
        shape_string_interpolation: cyan_bold
        shape_table: blue_bold
        shape_variable: purple
        shape_vardecl: purple
    }
}

# Starship prompt (if available)
if (which starship | is-not-empty) {
    $env.STARSHIP_SHELL = "nu"
    $env.STARSHIP_SESSION_KEY = (random chars -l 16)
    $env.PROMPT_MULTILINE_INDICATOR = (^starship prompt --continuation)
    
    # Define the prompt functions
    $env.PROMPT_COMMAND = { || starship prompt $"--cmd-duration=($env.CMD_DURATION_MS)" $"--status=($env.LAST_EXIT_CODE)" }
    $env.PROMPT_COMMAND_RIGHT = { || starship prompt --right $"--cmd-duration=($env.CMD_DURATION_MS)" $"--status=($env.LAST_EXIT_CODE)" }
}