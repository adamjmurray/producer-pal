// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: MIT

// Spike: print an Audio Unit's parameters with their groups, as JSON
// ([{address, groups, name}], outermost group first). vst~ only gives flat names; the AU's parameter
// tree also says which module each one is in.
//
// Usage: swift scripts/live-api/plugin-host/au-param-groups.swift "<AU name>"

import AVFoundation

let name = CommandLine.arguments.count > 1 ? CommandLine.arguments[1] : ""
let found = AVAudioUnitComponentManager.shared().components { component, _ in
  component.name == name
}

guard let component = found.first else {
  FileHandle.standardError.write("no Audio Unit named \"\(name)\"\n".data(using: .utf8)!)
  exit(1)
}

var rows: [[String: Any]] = []

func walk(_ node: AUParameterNode, _ groups: [String]) {
  if let group = node as? AUParameterGroup {
    for child in group.children { walk(child, groups + [group.displayName]) }
  } else if let param = node as? AUParameter {
    rows.append(["address": param.address, "groups": groups.filter { !$0.isEmpty }, "name": param.displayName])
  }
}

var done = false

AUAudioUnit.instantiate(with: component.audioComponentDescription, options: [.loadOutOfProcess]) {
  unit, error in
  if let tree = unit?.parameterTree {
    walk(tree, [])
    let json = try! JSONSerialization.data(withJSONObject: rows, options: [])
    print(String(data: json, encoding: .utf8)!)
  } else {
    FileHandle.standardError.write("no parameter tree: \(String(describing: error))\n".data(using: .utf8)!)
  }
  done = true
}

while !done { RunLoop.main.run(until: Date().addingTimeInterval(0.1)) }
