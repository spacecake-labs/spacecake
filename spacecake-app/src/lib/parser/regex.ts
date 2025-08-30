/**
 * This module contains regular expressions for parsing various types of text.
 *
 * It's is designed to be used in conjunction with the other parser modules.
 */

export const EMPTY_PATTERN = /(?:)/

export const SPACE_CONSUMER_PATTERN = /[\s\n]*/

export const DIRECTIVE_PATTERN = /@(\S+)\s+(::|:)\s*(.*)/

export const PYTHON_COMMENT_PREFIX_PATTERN = /#\s?/

export const PYTHON_MD_PREFIX_PATTERN = /#🍰\s?/
