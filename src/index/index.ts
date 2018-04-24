
import * as vscode from 'vscode';
import { build } from './build';
import { parseHcl } from './hcl-hil';

export interface QueryOptions {
    name?: string;
    section_type?: string;
    type?: string;
}

function getKind(sectionType: string): vscode.SymbolKind {
    switch (sectionType) {
        case "resource": return vscode.SymbolKind.Interface;
        case "output": return vscode.SymbolKind.Property;
        case "variable": return vscode.SymbolKind.Variable;
    }

    return null;
}

export class TypedSection extends vscode.SymbolInformation {
    references: Reference[] = [];

    constructor(
        readonly sectionType: string,
        readonly type: string,
        readonly typeLocation: vscode.Location,
        readonly name: string,
        readonly nameLocation: vscode.Location,
        location: vscode.Location) {
        super(name, getKind(sectionType), "", location)
    }

    match(options?: QueryOptions): boolean {
        if (!options)
            return true;

        if (options.section_type && this.sectionType === options.section_type)
            return true;

        if (options.type && this.type.match(options.type))
            return true;

        if (options.name && this.name.match(options.name))
            return true;

        return false;
    }
}

export class UntypedSection extends vscode.SymbolInformation {
    references: Reference[] = [];

    constructor(
        readonly sectionType: string,
        name: string,
        readonly nameLocation: vscode.Location,
        location: vscode.Location) {
        super(name, getKind(sectionType), "", location);
    }

    match(options?: QueryOptions): boolean {
        if (!options)
            return true;

        if (options.section_type && this.sectionType === options.section_type)
            return true;

        return options.name && !!this.name.match(options.name);
    }
}

export type Section = UntypedSection | TypedSection;

export class Reference {
    readonly type: string;
    readonly parts: string[];
    readonly location: vscode.Location;

    constructor(expr: string, location: vscode.Location) {
        let parts = expr.split('.');

        this.type = (parts[0] === "var") ? "variable" : parts[0];
        this.parts = parts.slice(1);

        this.location = location;
    }

    getQuery(): QueryOptions {
        if (this.type === "variable") {
            return {
                section_type: this.type,
                name: this.parts[0]
            }
        }

        if (this.type === "data") {
            return {
                section_type: this.type,
                type: this.parts[0],
                name: this.parts[1]
            }
        }

        if (this.type === "module") {
            // TODO: actually parse modules correctly, which will also
            //   allow us to handle these references correctly
            return {
                section_type: this.type,
                name: this.parts[0]
            }
        }

        // assume resource
        return {
            section_type: "resource",
            type: this.type,
            name: this.parts[0]
        }
    }
}

export class FileIndex {
    sections: Section[] = [];

    constructor(public uri: vscode.Uri) { }

    add(section: Section) {
        this.sections.push(section);
    }

    *query(options?: QueryOptions): IterableIterator<Section> {
        for (let s of this.sections)
            if (s.match(options))
                yield s;
    }
}

export class Index {
    private Files = new Map<string, FileIndex>();

    constructor(...indices: FileIndex[]) {
        indices.map((i) => this.add(i));
    }

    add(index: FileIndex) {
        this.Files.set(index.uri.toString(), index);
    }

    delete(uri: vscode.Uri) {
        this.Files.delete(uri.toString());
    }

    get(uri: vscode.Uri): FileIndex | null {
        return this.Files.get(uri.toString());
    }

    query(uri: "ALL_FILES" | vscode.Uri, options?: QueryOptions): Section[] {
        let uris = uri === "ALL_FILES" ? [...this.Files.keys()] : [uri.toString()];

        let indices = uris.map((u) => this.Files.get(u)).filter((i) => i != null);

        return indices.reduce((a, i) => a.concat(...i.query(options)), new Array<Section>());
    }
}

export let WorkspaceIndex = new Index;