export const SECTIONS_DIR = '/workspace/sections';
export const RESEARCH_DIR = '/workspace/research';

export function sectionFilePath(section: string): string {
	return `${SECTIONS_DIR}/${section}.md`;
}

export function seedSectionMarkdown(section: string): string {
	const title = titleFromSlug(section);
	return `# ${title}

Status: planning

## Constraints

(none yet)

## Options

(none yet)

## Decisions

(none yet)
`;
}

export function titleFromSlug(slug: string): string {
	return slug
		.split('-')
		.map((part) => (part[0] === undefined ? part : `${part[0].toUpperCase()}${part.slice(1)}`))
		.join(' ');
}
