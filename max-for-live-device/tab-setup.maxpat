{
    "patcher": {
        "fileversion": 1,
        "appversion": {
            "major": 9,
            "minor": 1,
            "revision": 4,
            "architecture": "x64",
            "modernui": 1
        },
        "classnamespace": "box",
        "rect": [ 228.0, 117.0, 864.0, 680.0 ],
        "openinpresentation": 1,
        "boxes": [
            {
                "box": {
                    "angle": 270.0,
                    "annotation": "The format used to represent the notes inside MIDI clips:\n* barbeat - full-featured syntax tuned for large models\n* stark - simplified syntax tuned for small models\n* midi-json - json format tuned for manipulating MIDI with code",
                    "bgcolor": [ 0.163688058058427, 0.163688010157025, 0.163688022674427, 0.0 ],
                    "hint": "",
                    "id": "obj-96",
                    "ignoreclick": 0,
                    "maxclass": "panel",
                    "mode": 0,
                    "numinlets": 1,
                    "numoutlets": 0,
                    "patching_rect": [ 2.0000000596046448, 155.00000461935997, 63.0, 83.5 ],
                    "presentation": 1,
                    "presentation_rect": [ 4.0, 123.0, 114.00000339746475, 24.00000098347664 ],
                    "proportion": 0.39,
                    "varname": "Notation"
                }
            },
            {
                "box": {
                    "id": "obj-94",
                    "maxclass": "live.comment",
                    "numinlets": 1,
                    "numoutlets": 0,
                    "patching_rect": [ 62.66666853427887, 122.00000363588333, 49.0, 18.0 ],
                    "presentation": 1,
                    "presentation_rect": [ 65.66666862368584, 124.66667038202286, 46.00000137090683, 18.0 ],
                    "text": "Notation",
                    "textjustification": 0
                }
            },
            {
                "box": {
                    "fontface": 1,
                    "fontsize": 11.0,
                    "id": "obj-91",
                    "maxclass": "live.comment",
                    "numinlets": 1,
                    "numoutlets": 0,
                    "patching_rect": [ 100.33333632349968, 158.33333805203438, 58.0, 20.0 ],
                    "presentation": 1,
                    "presentation_rect": [ 5.6666668355464935, 83.3333358168602, 57.33333343267441, 20.0 ],
                    "text": "Behavior",
                    "textjustification": 0
                }
            },
            {
                "box": {
                    "bubble": 1,
                    "bubblepoint": 0.0,
                    "bubbleside": 0,
                    "bubbletextmargin": 2,
                    "fontsize": 9.5,
                    "hidden": 1,
                    "id": "obj-38",
                    "linecount": 2,
                    "maxclass": "comment",
                    "numinlets": 1,
                    "numoutlets": 0,
                    "patching_rect": [ 193.0, 418.0, 66.0, 41.0 ],
                    "presentation": 1,
                    "presentation_rect": [ 56.0, 14.0, 92.0, 30.0 ],
                    "text": "See Max Console",
                    "textjustification": 1,
                    "varname": "see-console"
                }
            },
            {
                "box": {
                    "activebgcolor": [ 0.0, 0.0, 0.0, 1.0 ],
                    "activebgoncolor": [ 0.4, 0.0, 0.0, 1.0 ],
                    "id": "obj-55",
                    "ignoreclick": 1,
                    "maxclass": "live.button",
                    "numinlets": 1,
                    "numoutlets": 1,
                    "outlettype": [ "" ],
                    "parameter_enable": 1,
                    "patching_rect": [ 373.0, 483.0, 15.0, 15.0 ],
                    "presentation": 1,
                    "presentation_rect": [ 53.5, 6.5, 15.0, 15.0 ],
                    "saved_attribute_attributes": {
                        "activebgcolor": {
                            "expression": ""
                        },
                        "activebgoncolor": {
                            "expression": ""
                        },
                        "valueof": {
                            "parameter_enum": [ "off", "on" ],
                            "parameter_longname": "live.button",
                            "parameter_mmax": 1,
                            "parameter_modmode": 0,
                            "parameter_shortname": "live.button",
                            "parameter_type": 2
                        }
                    },
                    "varname": "live.button"
                }
            },
            {
                "box": {
                    "angle": 270.0,
                    "annotation": "Displays the current status of the Producer Pal server that AI uses to control Live. If it says anything other than \"Running\", AI will not be able to connect. Click the \"start\" button to manually start the server.",
                    "bgcolor": [ 0.163688058058427, 0.163688010157025, 0.163688022674427, 0.0 ],
                    "id": "obj-33",
                    "ignoreclick": 0,
                    "maxclass": "panel",
                    "mode": 0,
                    "numinlets": 1,
                    "numoutlets": 0,
                    "patching_rect": [ 385.0, 584.0, 19.0, 49.5 ],
                    "presentation": 1,
                    "presentation_rect": [ 5.6666668355464935, 4.0000001192092896, 112.3333331644535, 20.000000596046448 ],
                    "proportion": 0.39,
                    "varname": "Producer Pal Status"
                }
            },
            {
                "box": {
                    "id": "obj-95",
                    "maxclass": "newobj",
                    "numinlets": 1,
                    "numoutlets": 1,
                    "outlettype": [ "" ],
                    "patching_rect": [ 744.25, 168.0, 110.0, 22.0 ],
                    "text": "prepend setsymbol"
                }
            },
            {
                "box": {
                    "id": "obj-92",
                    "maxclass": "message",
                    "numinlets": 2,
                    "numoutlets": 1,
                    "outlettype": [ "" ],
                    "patching_rect": [ 740.25, 243.0, 68.0, 22.0 ],
                    "text": "notation $1"
                }
            },
            {
                "box": {
                    "annotation": "The format used to represent the notes inside MIDI clips:\n* barbeat - full-featured syntax tuned for large models\n* stark - simplified syntax tuned for small models\n* midi-json - json format tuned for manipulating MIDI with code",
                    "annotation_name": "Notation",
                    "id": "obj-90",
                    "maxclass": "live.menu",
                    "numinlets": 1,
                    "numoutlets": 3,
                    "outlettype": [ "", "", "float" ],
                    "parameter_enable": 1,
                    "patching_rect": [ 744.25, 219.0, 49.0, 15.0 ],
                    "presentation": 1,
                    "presentation_rect": [ 9.000000268220901, 126.33333709836006, 54.0, 15.0 ],
                    "saved_attribute_attributes": {
                        "valueof": {
                            "parameter_enum": [ "barbeat", "stark", "midi-json" ],
                            "parameter_invisible": 1,
                            "parameter_longname": "notation",
                            "parameter_mmax": 2,
                            "parameter_modmode": 0,
                            "parameter_shortname": "notation",
                            "parameter_type": 2
                        }
                    },
                    "varname": "notation"
                }
            },
            {
                "box": {
                    "annotation": "Direct access to the Ableton Live Object Model. Lets the AI read or modify any Live Set property. Can be used to workaround bugs and limitations in Producer Pal's tools. \n\nIt is disabled by default to avoid \"distracting the AI\". The AI may struggle to complete tasks using the Live API directly. It's better to use the other tools when possible.",
                    "annotation_name": "Direct Live API",
                    "id": "obj-84",
                    "maxclass": "live.toggle",
                    "numinlets": 1,
                    "numoutlets": 1,
                    "outlettype": [ "" ],
                    "parameter_enable": 1,
                    "patching_rect": [ 207.5, 85.0, 15.0, 15.0 ],
                    "presentation": 1,
                    "presentation_rect": [ 138.0000041127205, 91.66666939854622, 15.0, 15.0 ],
                    "saved_attribute_attributes": {
                        "valueof": {
                            "parameter_enum": [ "off", "on" ],
                            "parameter_initial": [ 0 ],
                            "parameter_initial_enable": 1,
                            "parameter_invisible": 1,
                            "parameter_longname": "direct-live-api",
                            "parameter_mmax": 1,
                            "parameter_modmode": 0,
                            "parameter_shortname": "direct-live-api",
                            "parameter_type": 2
                        }
                    },
                    "varname": "direct-live-api"
                }
            },
            {
                "box": {
                    "annotation": "Enable for smaller local LLMs. Simplifies features to reduce confusion.",
                    "annotation_name": "Small Model Mode",
                    "id": "obj-21",
                    "maxclass": "live.toggle",
                    "numinlets": 1,
                    "numoutlets": 1,
                    "outlettype": [ "" ],
                    "parameter_enable": 1,
                    "patching_rect": [ 318.0, 83.0, 15.0, 15.0 ],
                    "presentation": 1,
                    "presentation_rect": [ 9.000000268220901, 105.00000312924385, 15.0, 15.0 ],
                    "saved_attribute_attributes": {
                        "valueof": {
                            "parameter_enum": [ "off", "on" ],
                            "parameter_initial": [ 0 ],
                            "parameter_initial_enable": 1,
                            "parameter_invisible": 1,
                            "parameter_longname": "small-model-mode",
                            "parameter_mmax": 1,
                            "parameter_modmode": 0,
                            "parameter_shortname": "small-model-mode",
                            "parameter_type": 2
                        }
                    },
                    "varname": "small-model-mode"
                }
            },
            {
                "box": {
                    "annotation": "Maximum time to wait for AI tool operations to complete. Default is 30 seconds. A single operation may involve multiple Live API calls. Increase if experiencing timeout errors on complex operations or slower systems.",
                    "annotation_name": "Timeout",
                    "id": "obj-68",
                    "maxclass": "live.numbox",
                    "numinlets": 1,
                    "numoutlets": 2,
                    "outlettype": [ "", "float" ],
                    "parameter_enable": 1,
                    "patching_rect": [ 23.0, 83.0, 44.0, 15.0 ],
                    "presentation": 1,
                    "presentation_rect": [ 55.00000163912773, 62.00000184774399, 44.0, 15.0 ],
                    "saved_attribute_attributes": {
                        "valueof": {
                            "parameter_initial": [ 30.0 ],
                            "parameter_initial_enable": 1,
                            "parameter_invisible": 1,
                            "parameter_longname": "timeout",
                            "parameter_mmax": 60.0,
                            "parameter_mmin": 1.0,
                            "parameter_modmode": 4,
                            "parameter_shortname": "timeout",
                            "parameter_type": 1,
                            "parameter_units": "sec",
                            "parameter_unitstyle": 9
                        }
                    },
                    "varname": "timeout"
                }
            },
            {
                "box": {
                    "annotation": "Network port for Producer Pal's connection to AI such as Claude Desktop. Default is 3350. Change if you have port conflicts with other software. If changed, the AI's MCP connection settings must be updated to match (e.g. in Claude Desktop extension settings).",
                    "annotation_name": "Server Port",
                    "id": "obj-64",
                    "maxclass": "live.numbox",
                    "numinlets": 1,
                    "numoutlets": 2,
                    "outlettype": [ "", "float" ],
                    "parameter_enable": 1,
                    "patching_rect": [ 439.0, 534.0, 44.0, 15.0 ],
                    "presentation": 1,
                    "presentation_rect": [ 55.00000163912773, 45.00000134110451, 44.0, 15.0 ],
                    "saved_attribute_attributes": {
                        "valueof": {
                            "parameter_initial": [ 3350 ],
                            "parameter_initial_enable": 1,
                            "parameter_invisible": 1,
                            "parameter_longname": "port",
                            "parameter_mmax": 3555.0,
                            "parameter_mmin": 3300.0,
                            "parameter_modmode": 4,
                            "parameter_shortname": "port",
                            "parameter_type": 1,
                            "parameter_unitstyle": 0
                        }
                    },
                    "varname": "port"
                }
            },
            {
                "box": {
                    "id": "obj-89",
                    "maxclass": "newobj",
                    "numinlets": 1,
                    "numoutlets": 1,
                    "outlettype": [ "" ],
                    "patching_rect": [ 735.0, 109.0, 72.0, 22.0 ],
                    "text": "prepend set"
                }
            },
            {
                "box": {
                    "id": "obj-88",
                    "maxclass": "message",
                    "numinlets": 2,
                    "numoutlets": 1,
                    "outlettype": [ "" ],
                    "patching_rect": [ 207.0, 142.0, 105.0, 22.0 ],
                    "text": "liveApiEnabled $1"
                }
            },
            {
                "box": {
                    "angle": 270.0,
                    "annotation": "Direct access to the Ableton Live Object Model. Lets the AI read or modify any Live Set property. Can be used to workaround bugs and limitations in Producer Pal's tools. \n\nIt is disabled by default to avoid \"distracting the AI\". The AI may struggle to complete tasks using the Live API directly. It's better to use the other tools when possible.",
                    "bgcolor": [ 0.163688058058427, 0.163688010157025, 0.163688022674427, 0.0 ],
                    "hint": "",
                    "id": "obj-83",
                    "ignoreclick": 0,
                    "maxclass": "panel",
                    "mode": 0,
                    "numinlets": 1,
                    "numoutlets": 0,
                    "patching_rect": [ 249.0, 574.0, 63.0, 83.5 ],
                    "presentation": 1,
                    "presentation_rect": [ 133.00000396370888, 85.33333587646484, 114.00000339746475, 22.33333346247673 ],
                    "proportion": 0.39,
                    "varname": "Direct Live API"
                }
            },
            {
                "box": {
                    "id": "obj-87",
                    "linecount": 2,
                    "maxclass": "live.comment",
                    "numinlets": 1,
                    "numoutlets": 0,
                    "patching_rect": [ 222.0, 105.5, 49.0, 29.0 ],
                    "presentation": 1,
                    "presentation_rect": [ 155.00000461935997, 89.66666933894157, 87.0, 18.0 ],
                    "text": "Direct Live API",
                    "textjustification": 0
                }
            },
            {
                "box": {
                    "angle": 270.0,
                    "annotation": "Enable for smaller local language models. Simplifies features to reduce confusion. Enabling this will reduce Producer Pal's capabilities.",
                    "bgcolor": [ 0.163688058058427, 0.163688010157025, 0.163688022674427, 0.0 ],
                    "hint": "",
                    "id": "obj-27",
                    "ignoreclick": 0,
                    "maxclass": "panel",
                    "mode": 0,
                    "numinlets": 1,
                    "numoutlets": 0,
                    "patching_rect": [ 296.0, 496.0, 63.0, 83.5 ],
                    "presentation": 1,
                    "presentation_rect": [ 4.16666679084301, 100.00000257790089, 114.00000339746475, 24.00000098347664 ],
                    "proportion": 0.39,
                    "varname": "Small Model Mode"
                }
            },
            {
                "box": {
                    "angle": 270.0,
                    "annotation": "Maximum time to wait for AI tool operations to complete. Default is 30 seconds. A single operation may involve multiple Live API calls. Increase if experiencing timeout errors on complex operations or slower systems.",
                    "bgcolor": [ 0.163688058058427, 0.163688010157025, 0.163688022674427, 0.0 ],
                    "hint": "",
                    "id": "obj-30",
                    "ignoreclick": 0,
                    "maxclass": "panel",
                    "mode": 0,
                    "numinlets": 1,
                    "numoutlets": 0,
                    "patching_rect": [ 341.0, 541.0, 63.0, 83.5 ],
                    "presentation": 1,
                    "presentation_rect": [ 4.0000001192092896, 61.000001817941666, 114.00000339746475, 18.0 ],
                    "proportion": 0.39,
                    "varname": "Timeout"
                }
            },
            {
                "box": {
                    "angle": 270.0,
                    "annotation": "Network port for Producer Pal's connection to AI such as Claude Desktop. Default is 3350. Change if you have port conflicts with other software. If changed, the AI's MCP connection settings must be updated to match (e.g. in Claude Desktop extension settings).",
                    "bgcolor": [ 0.163688058058427, 0.163688010157025, 0.163688022674427, 0.0 ],
                    "hint": "",
                    "id": "obj-31",
                    "ignoreclick": 0,
                    "maxclass": "panel",
                    "mode": 0,
                    "numinlets": 1,
                    "numoutlets": 0,
                    "patching_rect": [ 356.0, 556.0, 63.0, 83.5 ],
                    "presentation": 1,
                    "presentation_rect": [ 4.0000001192092896, 41.00000122189522, 114.00000339746475, 20.055414140224457 ],
                    "proportion": 0.39,
                    "varname": "Server Port"
                }
            },
            {
                "box": {
                    "id": "obj-75",
                    "maxclass": "newobj",
                    "numinlets": 1,
                    "numoutlets": 0,
                    "patching_rect": [ 630.0, 459.0, 89.0, 22.0 ],
                    "text": "s ---node-script"
                }
            },
            {
                "box": {
                    "id": "obj-23",
                    "maxclass": "newobj",
                    "numinlets": 1,
                    "numoutlets": 1,
                    "outlettype": [ "" ],
                    "patching_rect": [ 651.0, 119.0, 72.0, 22.0 ],
                    "text": "prepend set"
                }
            },
            {
                "box": {
                    "id": "obj-19",
                    "maxclass": "newobj",
                    "numinlets": 1,
                    "numoutlets": 1,
                    "outlettype": [ "" ],
                    "patching_rect": [ 602.0, 80.0, 72.0, 22.0 ],
                    "text": "prepend set"
                }
            },
            {
                "box": {
                    "id": "obj-15",
                    "linecount": 2,
                    "maxclass": "newobj",
                    "numinlets": 6,
                    "numoutlets": 6,
                    "outlettype": [ "", "", "", "", "", "" ],
                    "patching_rect": [ 602.0, 32.0, 218.0, 35.0 ],
                    "text": "route smallModelMode compactOutput sampleFolder liveApiEnabled notation"
                }
            },
            {
                "box": {
                    "id": "obj-11",
                    "maxclass": "newobj",
                    "numinlets": 0,
                    "numoutlets": 1,
                    "outlettype": [ "" ],
                    "patching_rect": [ 602.0, -5.0, 60.0, 22.0 ],
                    "text": "r ---config"
                }
            },
            {
                "box": {
                    "id": "obj-10",
                    "maxclass": "newobj",
                    "numinlets": 0,
                    "numoutlets": 1,
                    "outlettype": [ "" ],
                    "patching_rect": [ 23.0, -14.0, 95.0, 22.0 ],
                    "text": "r ---node-started"
                }
            },
            {
                "box": {
                    "id": "obj-71",
                    "maxclass": "newobj",
                    "numinlets": 1,
                    "numoutlets": 1,
                    "outlettype": [ "outputvalue" ],
                    "patching_rect": [ 23.0, 19.0, 77.0, 22.0 ],
                    "text": "t outputvalue"
                }
            },
            {
                "box": {
                    "id": "obj-32",
                    "linecount": 6,
                    "maxclass": "comment",
                    "numinlets": 1,
                    "numoutlets": 0,
                    "patching_rect": [ 490.0, 513.0, 100.0, 87.0 ],
                    "text": "Note, the port cannot be synced on start because it will stop the MCP server"
                }
            },
            {
                "box": {
                    "id": "obj-107",
                    "maxclass": "message",
                    "numinlets": 2,
                    "numoutlets": 1,
                    "outlettype": [ "" ],
                    "patching_rect": [ 663.0, 547.0, 43.0, 22.0 ],
                    "text": "(none)"
                }
            },
            {
                "box": {
                    "id": "obj-108",
                    "maxclass": "newobj",
                    "numinlets": 1,
                    "numoutlets": 2,
                    "outlettype": [ "", "" ],
                    "patching_rect": [ 718.0, 375.0, 89.0, 22.0 ],
                    "text": "t l l"
                }
            },
            {
                "box": {
                    "id": "obj-109",
                    "maxclass": "newobj",
                    "numinlets": 2,
                    "numoutlets": 2,
                    "outlettype": [ "", "" ],
                    "patching_rect": [ 718.0, 413.0, 59.0, 22.0 ],
                    "text": "route text"
                }
            },
            {
                "box": {
                    "id": "obj-110",
                    "maxclass": "newobj",
                    "numinlets": 2,
                    "numoutlets": 1,
                    "outlettype": [ "int" ],
                    "patching_rect": [ 788.0, 478.0, 29.5, 22.0 ],
                    "text": "+ 1"
                }
            },
            {
                "box": {
                    "id": "obj-111",
                    "maxclass": "newobj",
                    "numinlets": 2,
                    "numoutlets": 2,
                    "outlettype": [ "", "" ],
                    "patching_rect": [ 663.0, 517.0, 74.0, 22.0 ],
                    "text": "gate 2"
                }
            },
            {
                "box": {
                    "id": "obj-112",
                    "maxclass": "newobj",
                    "numinlets": 2,
                    "numoutlets": 1,
                    "outlettype": [ "int" ],
                    "patching_rect": [ 788.0, 445.0, 29.5, 22.0 ],
                    "text": "> 1"
                }
            },
            {
                "box": {
                    "id": "obj-113",
                    "maxclass": "newobj",
                    "numinlets": 2,
                    "numoutlets": 2,
                    "outlettype": [ "", "" ],
                    "patching_rect": [ 788.0, 413.0, 37.0, 22.0 ],
                    "text": "zl len"
                }
            },
            {
                "box": {
                    "id": "obj-97",
                    "maxclass": "newobj",
                    "numinlets": 1,
                    "numoutlets": 2,
                    "outlettype": [ "bang", "clear" ],
                    "patching_rect": [ 682.0, 289.0, 51.0, 22.0 ],
                    "text": "t b clear"
                }
            },
            {
                "box": {
                    "id": "obj-82",
                    "maxclass": "newobj",
                    "numinlets": 1,
                    "numoutlets": 2,
                    "outlettype": [ "bang", "" ],
                    "patching_rect": [ 578.0, 262.0, 31.0, 22.0 ],
                    "text": "t b s"
                }
            },
            {
                "box": {
                    "id": "obj-79",
                    "maxclass": "newobj",
                    "numinlets": 1,
                    "numoutlets": 1,
                    "outlettype": [ "" ],
                    "patching_rect": [ 602.0, 293.0, 72.0, 22.0 ],
                    "text": "prepend set"
                }
            },
            {
                "box": {
                    "id": "obj-73",
                    "maxclass": "newobj",
                    "numinlets": 1,
                    "numoutlets": 1,
                    "outlettype": [ "" ],
                    "patching_rect": [ 578.0, 410.0, 129.0, 22.0 ],
                    "text": "prepend sampleFolder"
                }
            },
            {
                "box": {
                    "id": "obj-78",
                    "maxclass": "newobj",
                    "numinlets": 2,
                    "numoutlets": 2,
                    "outlettype": [ "", "" ],
                    "patching_rect": [ 578.0, 375.0, 59.0, 22.0 ],
                    "text": "route text"
                }
            },
            {
                "box": {
                    "id": "obj-72",
                    "maxclass": "textedit",
                    "numinlets": 1,
                    "numoutlets": 4,
                    "outlettype": [ "", "int", "", "" ],
                    "parameter_enable": 1,
                    "patching_rect": [ 578.0, 330.0, 141.0, 24.0 ],
                    "saved_attribute_attributes": {
                        "valueof": {
                            "parameter_invisible": 1,
                            "parameter_longname": "sampleFolder",
                            "parameter_modmode": 0,
                            "parameter_shortname": "sampleFolder",
                            "parameter_type": 3
                        }
                    },
                    "varname": "textedit"
                }
            },
            {
                "box": {
                    "id": "obj-63",
                    "maxclass": "newobj",
                    "numinlets": 1,
                    "numoutlets": 2,
                    "outlettype": [ "outputvalue", "bang" ],
                    "patching_rect": [ 441.0, 19.0, 127.0, 22.0 ],
                    "text": "t outputvalue b"
                }
            },
            {
                "box": {
                    "id": "obj-37",
                    "linecount": 3,
                    "maxclass": "comment",
                    "numinlets": 1,
                    "numoutlets": 0,
                    "patching_rect": [ 242.0, -10.0, 166.0, 47.0 ],
                    "text": "sync values from the UI to Node for Max and v8 when they've finished starting"
                }
            },
            {
                "box": {
                    "id": "obj-58",
                    "maxclass": "newobj",
                    "numinlets": 0,
                    "numoutlets": 1,
                    "outlettype": [ "" ],
                    "patching_rect": [ 441.0, -14.0, 81.0, 22.0 ],
                    "text": "r ---v8-started"
                }
            },
            {
                "box": {
                    "annotation": "Remove the selected sample folder, preventing AI from scanning it. Note: If the AI has already scanned it with the read-samples tool, it will remember what it saw until you start a new conversation.",
                    "annotation_name": "Clear Sample Folder",
                    "id": "obj-62",
                    "maxclass": "live.text",
                    "mode": 0,
                    "numinlets": 1,
                    "numoutlets": 2,
                    "outlettype": [ "", "" ],
                    "parameter_enable": 1,
                    "patching_rect": [ 682.0, 261.0, 42.0, 18.0 ],
                    "presentation": 1,
                    "presentation_rect": [ 181.0, 24.0, 42.0, 18.0 ],
                    "saved_attribute_attributes": {
                        "valueof": {
                            "parameter_enum": [ "val1", "val2" ],
                            "parameter_longname": "live.text[3]",
                            "parameter_mmax": 1,
                            "parameter_modmode": 0,
                            "parameter_shortname": "live.text[2]",
                            "parameter_type": 2
                        }
                    },
                    "text": "clear",
                    "varname": "live.text[3]"
                }
            },
            {
                "box": {
                    "annotation": "Select a folder to allow the AI to scan for supported audio samples (.wav, .aiff, .aif, .aifc, .flac, .ogg, .mp3, .m4a) and use them to create audio clips.",
                    "annotation_name": "Choose Sample Folder",
                    "id": "obj-35",
                    "maxclass": "live.text",
                    "mode": 0,
                    "numinlets": 1,
                    "numoutlets": 2,
                    "outlettype": [ "", "" ],
                    "parameter_enable": 1,
                    "patching_rect": [ 578.0, 170.0, 48.0, 18.0 ],
                    "presentation": 1,
                    "presentation_rect": [ 129.0, 24.0, 48.0, 18.0 ],
                    "saved_attribute_attributes": {
                        "valueof": {
                            "parameter_enum": [ "val1", "val2" ],
                            "parameter_longname": "live.text[2]",
                            "parameter_mmax": 1,
                            "parameter_modmode": 0,
                            "parameter_shortname": "live.text[2]",
                            "parameter_type": 2
                        }
                    },
                    "text": "choose",
                    "varname": "live.text[2]"
                }
            },
            {
                "box": {
                    "angle": 270.0,
                    "annotation": "Select a folder to allow the AI to scan for supported audio samples (.wav, .aiff, .aif, .aifc, .flac, .ogg, .mp3, .m4a) and use them to create audio clips.",
                    "bgcolor": [ 0.163688058058427, 0.163688010157025, 0.163688022674427, 0.0 ],
                    "hint": "",
                    "id": "obj-86",
                    "ignoreclick": 0,
                    "maxclass": "panel",
                    "mode": 0,
                    "numinlets": 1,
                    "numoutlets": 0,
                    "patching_rect": [ 203.0, 556.0, 63.0, 83.5 ],
                    "presentation": 1,
                    "presentation_rect": [ 123.0, 0.0, 126.70025211572647, 74.05541574954987 ],
                    "proportion": 0.39,
                    "varname": "Sample Folder"
                }
            },
            {
                "box": {
                    "fontface": 1,
                    "fontsize": 11.0,
                    "id": "obj-85",
                    "linecount": 2,
                    "maxclass": "live.comment",
                    "numinlets": 1,
                    "numoutlets": 0,
                    "patching_rect": [ 748.0, 326.0, 70.0, 33.0 ],
                    "presentation": 1,
                    "presentation_rect": [ 129.0, 4.0, 89.0, 20.0 ],
                    "text": "Sample Folder",
                    "textjustification": 0
                }
            },
            {
                "box": {
                    "id": "obj-81",
                    "maxclass": "newobj",
                    "numinlets": 1,
                    "numoutlets": 1,
                    "outlettype": [ "" ],
                    "patching_rect": [ 718.0, 589.0, 72.0, 22.0 ],
                    "text": "prepend set"
                }
            },
            {
                "box": {
                    "id": "obj-80",
                    "maxclass": "live.comment",
                    "numinlets": 1,
                    "numoutlets": 0,
                    "patching_rect": [ 718.0, 624.0, 61.0, 18.0 ],
                    "presentation": 1,
                    "presentation_rect": [ 128.0, 44.0, 122.0, 18.0 ],
                    "text": "(none)",
                    "textjustification": 0
                }
            },
            {
                "box": {
                    "id": "obj-77",
                    "maxclass": "newobj",
                    "numinlets": 1,
                    "numoutlets": 2,
                    "outlettype": [ "", "int" ],
                    "patching_rect": [ 718.0, 553.0, 55.0, 22.0 ],
                    "text": "strippath"
                }
            },
            {
                "box": {
                    "id": "obj-76",
                    "maxclass": "newobj",
                    "numinlets": 1,
                    "numoutlets": 2,
                    "outlettype": [ "", "int" ],
                    "patching_rect": [ 578.0, 231.0, 133.0, 22.0 ],
                    "text": "conformpath slash boot"
                }
            },
            {
                "box": {
                    "id": "obj-65",
                    "maxclass": "newobj",
                    "numinlets": 1,
                    "numoutlets": 0,
                    "patching_rect": [ 578.0, 459.0, 42.0, 22.0 ],
                    "text": "s ---v8"
                }
            },
            {
                "box": {
                    "id": "obj-4",
                    "maxclass": "newobj",
                    "numinlets": 1,
                    "numoutlets": 2,
                    "outlettype": [ "", "bang" ],
                    "patching_rect": [ 578.0, 199.0, 90.0, 22.0 ],
                    "text": "opendialog fold"
                }
            },
            {
                "box": {
                    "id": "obj-57",
                    "maxclass": "live.line",
                    "numinlets": 1,
                    "numoutlets": 0,
                    "patching_rect": [ 268.0, 517.0, 5.0, 100.0 ],
                    "presentation": 1,
                    "presentation_rect": [ 4.0000001192092896, 42.00000125169754, 114.0, 13.0 ]
                }
            },
            {
                "box": {
                    "fontface": 1,
                    "fontsize": 11.0,
                    "id": "obj-39",
                    "maxclass": "live.comment",
                    "numinlets": 1,
                    "numoutlets": 0,
                    "patching_rect": [ 324.0, 212.0, 58.0, 20.0 ],
                    "presentation": 1,
                    "presentation_rect": [ 134.0000039935112, 71.00000211596489, 53.846161, 20.0 ],
                    "text": "Debug",
                    "textjustification": 0
                }
            },
            {
                "box": {
                    "id": "obj-61",
                    "maxclass": "message",
                    "numinlets": 2,
                    "numoutlets": 1,
                    "outlettype": [ "" ],
                    "patching_rect": [ 372.0, 390.0, 129.0, 22.0 ],
                    "text": "activebgcolor 0 0.9 0 1"
                }
            },
            {
                "box": {
                    "id": "obj-60",
                    "maxclass": "message",
                    "numinlets": 2,
                    "numoutlets": 1,
                    "outlettype": [ "" ],
                    "patching_rect": [ 399.0, 420.0, 119.0, 22.0 ],
                    "text": "activebgcolor 0 0 0 1"
                }
            },
            {
                "box": {
                    "id": "obj-59",
                    "maxclass": "message",
                    "numinlets": 2,
                    "numoutlets": 1,
                    "outlettype": [ "" ],
                    "patching_rect": [ 428.0, 450.0, 129.0, 22.0 ],
                    "text": "activebgcolor 0.9 0 0 1"
                }
            },
            {
                "box": {
                    "id": "obj-34",
                    "maxclass": "message",
                    "numinlets": 2,
                    "numoutlets": 1,
                    "outlettype": [ "" ],
                    "patching_rect": [ 157.0, 418.0, 29.5, 22.0 ],
                    "text": "0"
                }
            },
            {
                "box": {
                    "id": "obj-36",
                    "maxclass": "message",
                    "numinlets": 2,
                    "numoutlets": 1,
                    "outlettype": [ "" ],
                    "patching_rect": [ 117.0, 418.0, 29.5, 22.0 ],
                    "text": "1"
                }
            },
            {
                "box": {
                    "id": "obj-53",
                    "linecount": 2,
                    "maxclass": "message",
                    "numinlets": 2,
                    "numoutlets": 1,
                    "outlettype": [ "" ],
                    "patching_rect": [ 132.0, 480.0, 134.0, 35.0 ],
                    "text": "script sendbox see-console hidden $1"
                }
            },
            {
                "box": {
                    "id": "obj-43",
                    "maxclass": "newobj",
                    "numinlets": 1,
                    "numoutlets": 2,
                    "outlettype": [ "", "" ],
                    "patching_rect": [ 132.0, 531.0, 67.0, 22.0 ],
                    "save": [ "#N", "thispatcher", ";", "#Q", "end", ";" ],
                    "text": "thispatcher"
                }
            },
            {
                "box": {
                    "id": "obj-51",
                    "maxclass": "message",
                    "numinlets": 2,
                    "numoutlets": 1,
                    "outlettype": [ "" ],
                    "patching_rect": [ 274.0, 313.0, 53.0, 22.0 ],
                    "text": "Stopped"
                }
            },
            {
                "box": {
                    "id": "obj-49",
                    "maxclass": "message",
                    "numinlets": 2,
                    "numoutlets": 1,
                    "outlettype": [ "" ],
                    "patching_rect": [ 148.0, 313.0, 53.0, 22.0 ],
                    "text": "Running"
                }
            },
            {
                "box": {
                    "id": "obj-47",
                    "maxclass": "message",
                    "numinlets": 2,
                    "numoutlets": 1,
                    "outlettype": [ "" ],
                    "patching_rect": [ 416.0, 313.0, 35.0, 22.0 ],
                    "text": "Error"
                }
            },
            {
                "box": {
                    "id": "obj-45",
                    "maxclass": "newobj",
                    "numinlets": 1,
                    "numoutlets": 1,
                    "outlettype": [ "bang" ],
                    "patching_rect": [ 380.0, 313.0, 22.0, 22.0 ],
                    "text": "t b"
                }
            },
            {
                "box": {
                    "id": "obj-40",
                    "maxclass": "newobj",
                    "numinlets": 1,
                    "numoutlets": 1,
                    "outlettype": [ "bang" ],
                    "patching_rect": [ 244.0, 313.0, 22.0, 22.0 ],
                    "text": "t b"
                }
            },
            {
                "box": {
                    "id": "obj-41",
                    "maxclass": "newobj",
                    "numinlets": 1,
                    "numoutlets": 1,
                    "outlettype": [ "bang" ],
                    "patching_rect": [ 116.0, 313.0, 22.0, 22.0 ],
                    "text": "t b"
                }
            },
            {
                "box": {
                    "id": "obj-42",
                    "maxclass": "live.comment",
                    "numinlets": 1,
                    "numoutlets": 0,
                    "patching_rect": [ 281.0, 439.0, 65.0, 18.0 ],
                    "presentation": 1,
                    "presentation_rect": [ 68.0, 5.0, 50.0, 18.0 ],
                    "text": "Stopped",
                    "textjustification": 0
                }
            },
            {
                "box": {
                    "id": "obj-44",
                    "maxclass": "newobj",
                    "numinlets": 0,
                    "numoutlets": 1,
                    "outlettype": [ "" ],
                    "patching_rect": [ 116.0, 270.0, 95.0, 22.0 ],
                    "text": "r ---node-started"
                }
            },
            {
                "box": {
                    "id": "obj-46",
                    "maxclass": "newobj",
                    "numinlets": 0,
                    "numoutlets": 1,
                    "outlettype": [ "" ],
                    "patching_rect": [ 244.0, 270.0, 101.0, 22.0 ],
                    "text": "r ---node-stopped"
                }
            },
            {
                "box": {
                    "id": "obj-48",
                    "maxclass": "newobj",
                    "numinlets": 0,
                    "numoutlets": 1,
                    "outlettype": [ "" ],
                    "patching_rect": [ 380.0, 270.0, 84.0, 22.0 ],
                    "text": "r ---node-error"
                }
            },
            {
                "box": {
                    "id": "obj-54",
                    "maxclass": "newobj",
                    "numinlets": 1,
                    "numoutlets": 1,
                    "outlettype": [ "" ],
                    "patching_rect": [ 281.0, 410.0, 77.0, 22.0 ],
                    "text": "prepend set"
                }
            },
            {
                "box": {
                    "annotation": "Return standard JSON for responses, which can aid debugging and custom integrations. This is more verbose than the default output format, which is designed to reduce LLM context window usage.",
                    "annotation_name": "JSON Output",
                    "id": "obj-17",
                    "maxclass": "live.toggle",
                    "numinlets": 1,
                    "numoutlets": 1,
                    "outlettype": [ "" ],
                    "parameter_enable": 1,
                    "patching_rect": [ 441.0, 83.0, 15.0, 15.0 ],
                    "presentation": 1,
                    "presentation_rect": [ 138.0000041127205, 111.00000330805779, 15.0, 15.0 ],
                    "saved_attribute_attributes": {
                        "valueof": {
                            "parameter_enum": [ "off", "on" ],
                            "parameter_initial": [ 0 ],
                            "parameter_initial_enable": 1,
                            "parameter_invisible": 1,
                            "parameter_longname": "json-output",
                            "parameter_mmax": 1,
                            "parameter_modmode": 0,
                            "parameter_shortname": "json-output",
                            "parameter_type": 2
                        }
                    },
                    "varname": "json-output"
                }
            },
            {
                "box": {
                    "annotation": "Log details of every incoming request from and response to the AI. Generally only useful when debugging recurring failures.",
                    "annotation_name": "Verbose Logs",
                    "id": "obj-8",
                    "maxclass": "live.toggle",
                    "numinlets": 1,
                    "numoutlets": 1,
                    "outlettype": [ "" ],
                    "parameter_enable": 1,
                    "patching_rect": [ 134.0, 85.0, 15.0, 15.0 ],
                    "presentation": 1,
                    "presentation_rect": [ 138.0000041127205, 130.0000038743019, 15.0, 15.0 ],
                    "saved_attribute_attributes": {
                        "valueof": {
                            "parameter_enum": [ "off", "on" ],
                            "parameter_initial": [ 0.0 ],
                            "parameter_initial_enable": 1,
                            "parameter_invisible": 1,
                            "parameter_longname": "verbose-logs",
                            "parameter_mmax": 1,
                            "parameter_modmode": 0,
                            "parameter_shortname": "verbose-logs",
                            "parameter_type": 2
                        }
                    },
                    "varname": "verbose-logs"
                }
            },
            {
                "box": {
                    "angle": 270.0,
                    "annotation": "Log details of every incoming request from and response to the AI. Generally only useful when debugging recurring failures.",
                    "bgcolor": [ 0.163688058058427, 0.163688010157025, 0.163688022674427, 0.0 ],
                    "hint": "",
                    "id": "obj-29",
                    "ignoreclick": 0,
                    "maxclass": "panel",
                    "mode": 0,
                    "numinlets": 1,
                    "numoutlets": 0,
                    "patching_rect": [ 326.0, 526.0, 63.0, 83.5 ],
                    "presentation": 1,
                    "presentation_rect": [ 133.00000396370888, 126.33333709836006, 110.66666996479034, 21.00000062584877 ],
                    "proportion": 0.39,
                    "varname": "Verbose Logs"
                }
            },
            {
                "box": {
                    "angle": 270.0,
                    "annotation": "Return standard JSON for responses, which can aid debugging and custom integrations. This is more verbose than the default output format, which is designed to reduce LLM context window usage.",
                    "bgcolor": [ 0.163688058058427, 0.163688010157025, 0.163688022674427, 0.0 ],
                    "hint": "",
                    "id": "obj-28",
                    "ignoreclick": 0,
                    "maxclass": "panel",
                    "mode": 0,
                    "numinlets": 1,
                    "numoutlets": 0,
                    "patching_rect": [ 311.0, 511.0, 63.0, 83.5 ],
                    "presentation": 1,
                    "presentation_rect": [ 133.00000396370888, 105.33333647251129, 110.66666996479034, 22.66666680574417 ],
                    "proportion": 0.39,
                    "varname": "JSON Output"
                }
            },
            {
                "box": {
                    "id": "obj-26",
                    "maxclass": "newobj",
                    "numinlets": 2,
                    "numoutlets": 1,
                    "outlettype": [ "int" ],
                    "patching_rect": [ 441.0, 109.0, 29.5, 22.0 ],
                    "text": "!= 1"
                }
            },
            {
                "box": {
                    "id": "obj-25",
                    "maxclass": "message",
                    "numinlets": 2,
                    "numoutlets": 1,
                    "outlettype": [ "" ],
                    "patching_rect": [ 318.0, 142.0, 116.0, 22.0 ],
                    "text": "smallModelMode $1"
                }
            },
            {
                "box": {
                    "id": "obj-22",
                    "linecount": 3,
                    "maxclass": "live.comment",
                    "numinlets": 1,
                    "numoutlets": 0,
                    "patching_rect": [ 337.0, 83.0, 49.0, 41.0 ],
                    "presentation": 1,
                    "presentation_rect": [ 26.000000774860382, 103.0000030696392, 87.0, 18.0 ],
                    "text": "Small Model Mode",
                    "textjustification": 0
                }
            },
            {
                "box": {
                    "id": "obj-20",
                    "maxclass": "message",
                    "numinlets": 2,
                    "numoutlets": 1,
                    "outlettype": [ "" ],
                    "patching_rect": [ 441.0, 142.0, 107.0, 22.0 ],
                    "text": "compactOutput $1"
                }
            },
            {
                "box": {
                    "id": "obj-18",
                    "linecount": 2,
                    "maxclass": "live.comment",
                    "numinlets": 1,
                    "numoutlets": 0,
                    "patching_rect": [ 459.0, 82.0, 47.0, 29.0 ],
                    "presentation": 1,
                    "presentation_rect": [ 154.00000458955765, 110.00000327825546, 70.064096, 18.0 ],
                    "text": "JSON Output",
                    "textjustification": 0
                }
            },
            {
                "box": {
                    "annotation": "Stop Producer Pal's server for AI connectivity. Use this to troubleshoot connection issues or for freeing up the port to connect to the device in the Max patch editor.",
                    "annotation_name": "Stop Server",
                    "id": "obj-70",
                    "maxclass": "live.text",
                    "mode": 0,
                    "numinlets": 1,
                    "numoutlets": 2,
                    "outlettype": [ "", "" ],
                    "parameter_enable": 1,
                    "patching_rect": [ 600.0, 609.0, 44.0, 15.0 ],
                    "presentation": 1,
                    "presentation_rect": [ 70.666669, 23.000001, 34.0, 18.0 ],
                    "saved_attribute_attributes": {
                        "valueof": {
                            "parameter_enum": [ "val1", "val2" ],
                            "parameter_invisible": 2,
                            "parameter_longname": "live.text[1]",
                            "parameter_mmax": 1,
                            "parameter_modmode": 0,
                            "parameter_shortname": "live.text",
                            "parameter_type": 2
                        }
                    },
                    "text": "stop",
                    "varname": "live.text[1]"
                }
            },
            {
                "box": {
                    "annotation": "Manually start Producer Pal's server for AI connectivity. This normally happens automatically when the device loads. It needs to be restarted after changing advanced settings.",
                    "annotation_name": "Start Server",
                    "id": "obj-69",
                    "maxclass": "live.text",
                    "mode": 0,
                    "numinlets": 1,
                    "numoutlets": 2,
                    "outlettype": [ "", "" ],
                    "parameter_enable": 1,
                    "patching_rect": [ 604.0, 518.0, 44.0, 16.0 ],
                    "presentation": 1,
                    "presentation_rect": [ 9.0, 23.000001, 34.0, 18.0 ],
                    "saved_attribute_attributes": {
                        "valueof": {
                            "parameter_enum": [ "val1", "val2" ],
                            "parameter_invisible": 2,
                            "parameter_longname": "live.text",
                            "parameter_mmax": 1,
                            "parameter_modmode": 0,
                            "parameter_shortname": "live.text",
                            "parameter_type": 2
                        }
                    },
                    "text": "start",
                    "varname": "live.text"
                }
            },
            {
                "box": {
                    "id": "obj-67",
                    "maxclass": "live.comment",
                    "numinlets": 1,
                    "numoutlets": 0,
                    "patching_rect": [ 69.0, 82.0, 44.0, 18.0 ],
                    "presentation": 1,
                    "presentation_rect": [ 8.000000238418579, 61.000001817941666, 45.0, 18.0 ],
                    "text": "Timeout",
                    "textjustification": 2
                }
            },
            {
                "box": {
                    "id": "obj-66",
                    "maxclass": "live.comment",
                    "numinlets": 1,
                    "numoutlets": 0,
                    "patching_rect": [ 440.0, 502.0, 43.0, 18.0 ],
                    "presentation": 1,
                    "presentation_rect": [ 8.000000238418579, 44.000001311302185, 45.0, 18.0 ],
                    "text": "Port",
                    "textjustification": 2
                }
            },
            {
                "box": {
                    "id": "obj-12",
                    "maxclass": "newobj",
                    "numinlets": 1,
                    "numoutlets": 0,
                    "patching_rect": [ 441.0, 212.0, 42.0, 22.0 ],
                    "text": "s ---v8"
                }
            },
            {
                "box": {
                    "id": "obj-16",
                    "maxclass": "message",
                    "numinlets": 2,
                    "numoutlets": 1,
                    "outlettype": [ "" ],
                    "patching_rect": [ 23.0, 142.0, 81.0, 22.0 ],
                    "text": "timeoutMs $1"
                }
            },
            {
                "box": {
                    "id": "obj-14",
                    "maxclass": "message",
                    "numinlets": 2,
                    "numoutlets": 1,
                    "outlettype": [ "" ],
                    "patching_rect": [ 134.0, 142.0, 68.0, 22.0 ],
                    "text": "verbose $1"
                }
            },
            {
                "box": {
                    "id": "obj-9",
                    "maxclass": "newobj",
                    "numinlets": 1,
                    "numoutlets": 0,
                    "patching_rect": [ 23.0, 212.0, 89.0, 22.0 ],
                    "text": "s ---node-script"
                }
            },
            {
                "box": {
                    "id": "obj-6",
                    "linecount": 2,
                    "maxclass": "live.comment",
                    "numinlets": 1,
                    "numoutlets": 0,
                    "patching_rect": [ 145.5, 105.5, 45.0, 29.0 ],
                    "presentation": 1,
                    "presentation_rect": [ 153.00000455975533, 129.0000038444996, 71.39743, 18.0 ],
                    "text": "Verbose Logs",
                    "textjustification": 0
                }
            },
            {
                "box": {
                    "id": "obj-24",
                    "maxclass": "newobj",
                    "numinlets": 1,
                    "numoutlets": 0,
                    "patching_rect": [ 439.0, 637.0, 107.0, 22.0 ],
                    "text": "s ---stop-if-running"
                }
            },
            {
                "box": {
                    "id": "obj-13",
                    "maxclass": "newobj",
                    "numinlets": 1,
                    "numoutlets": 0,
                    "patching_rect": [ 457.0, 605.0, 50.0, 22.0 ],
                    "text": "s ---port"
                }
            },
            {
                "box": {
                    "id": "obj-3",
                    "maxclass": "newobj",
                    "numinlets": 1,
                    "numoutlets": 2,
                    "outlettype": [ "bang", "int" ],
                    "patching_rect": [ 439.0, 563.0, 37.0, 22.0 ],
                    "text": "t b i"
                }
            },
            {
                "box": {
                    "id": "obj-74",
                    "maxclass": "newobj",
                    "numinlets": 2,
                    "numoutlets": 1,
                    "outlettype": [ "int" ],
                    "patching_rect": [ 24.0, 109.0, 43.0, 22.0 ],
                    "text": "* 1000"
                }
            },
            {
                "box": {
                    "id": "obj-7",
                    "maxclass": "newobj",
                    "numinlets": 1,
                    "numoutlets": 0,
                    "patching_rect": [ 600.0, 642.0, 53.0, 22.0 ],
                    "text": "s ---stop"
                }
            },
            {
                "box": {
                    "id": "obj-5",
                    "maxclass": "newobj",
                    "numinlets": 1,
                    "numoutlets": 0,
                    "patching_rect": [ 604.0, 551.0, 53.0, 22.0 ],
                    "text": "s ---start"
                }
            },
            {
                "box": {
                    "fontface": 1,
                    "fontsize": 11.0,
                    "id": "obj-2",
                    "maxclass": "live.comment",
                    "numinlets": 1,
                    "numoutlets": 0,
                    "patching_rect": [ 220.0, 213.0, 53.0, 20.0 ],
                    "presentation": 1,
                    "presentation_rect": [ 7.0, 4.0, 53.846161, 20.0 ],
                    "text": "Server",
                    "textjustification": 0
                }
            },
            {
                "box": {
                    "angle": 270.0,
                    "bgcolor": [ 0.27450980392156865, 0.27450980392156865, 0.27450980392156865, 1.0 ],
                    "id": "obj-50",
                    "maxclass": "panel",
                    "mode": 0,
                    "numinlets": 1,
                    "numoutlets": 0,
                    "patching_rect": [ 130.0, 589.0, 83.0, 75.0 ],
                    "presentation": 1,
                    "presentation_rect": [ 131.69871295800021, 72.00000214576721, 111.967960970499, 75.33333557844162 ],
                    "proportion": 0.39,
                    "saved_attribute_attributes": {
                        "bgfillcolor": {
                            "expression": "themecolor.live_assignment_text_bg"
                        }
                    }
                }
            },
            {
                "box": {
                    "angle": 270.0,
                    "bgcolor": [ 0.27450980392156865, 0.27450980392156865, 0.27450980392156865, 1.0 ],
                    "id": "obj-52",
                    "maxclass": "panel",
                    "mode": 0,
                    "numinlets": 1,
                    "numoutlets": 0,
                    "patching_rect": [ 91.0, 557.0, 83.0, 75.0 ],
                    "presentation": 1,
                    "presentation_rect": [ 4.0000001192092896, 4.0000001192092896, 114.00000339746475, 75.00000169873238 ],
                    "proportion": 0.39,
                    "saved_attribute_attributes": {
                        "bgfillcolor": {
                            "expression": "themecolor.live_assignment_text_bg"
                        }
                    }
                }
            },
            {
                "box": {
                    "angle": 270.0,
                    "bgcolor": [ 0.27450980392156865, 0.27450980392156865, 0.27450980392156865, 1.0 ],
                    "id": "obj-56",
                    "maxclass": "panel",
                    "mode": 0,
                    "numinlets": 1,
                    "numoutlets": 0,
                    "patching_rect": [ 4.0000001192092896, 83.66666916012764, 83.0, 75.0 ],
                    "presentation": 1,
                    "presentation_rect": [ 4.0000001192092896, 83.3333358168602, 114.3333367407322, 64.00000190734863 ],
                    "proportion": 0.39,
                    "saved_attribute_attributes": {
                        "bgfillcolor": {
                            "expression": "themecolor.live_assignment_text_bg"
                        }
                    }
                }
            },
            {
                "box": {
                    "angle": 270.0,
                    "background": 1,
                    "bgcolor": [ 0.163688058058427, 0.163688010157025, 0.163688022674427, 0.0 ],
                    "id": "obj-1",
                    "maxclass": "panel",
                    "mode": 0,
                    "numinlets": 1,
                    "numoutlets": 0,
                    "patching_rect": [ 230.0, 632.0, 34.0, 32.0 ],
                    "presentation": 1,
                    "presentation_rect": [ 0.0, 0.0, 250.0, 150.0 ],
                    "proportion": 0.39,
                    "rounded": 0
                }
            }
        ],
        "lines": [
            {
                "patchline": {
                    "destination": [ "obj-71", 0 ],
                    "source": [ "obj-10", 0 ]
                }
            },
            {
                "patchline": {
                    "destination": [ "obj-81", 0 ],
                    "source": [ "obj-107", 0 ]
                }
            },
            {
                "patchline": {
                    "destination": [ "obj-109", 0 ],
                    "source": [ "obj-108", 0 ]
                }
            },
            {
                "patchline": {
                    "destination": [ "obj-113", 0 ],
                    "source": [ "obj-108", 1 ]
                }
            },
            {
                "patchline": {
                    "destination": [ "obj-111", 1 ],
                    "source": [ "obj-109", 0 ]
                }
            },
            {
                "patchline": {
                    "destination": [ "obj-15", 0 ],
                    "source": [ "obj-11", 0 ]
                }
            },
            {
                "patchline": {
                    "destination": [ "obj-111", 0 ],
                    "source": [ "obj-110", 0 ]
                }
            },
            {
                "patchline": {
                    "destination": [ "obj-107", 0 ],
                    "source": [ "obj-111", 0 ]
                }
            },
            {
                "patchline": {
                    "destination": [ "obj-77", 0 ],
                    "source": [ "obj-111", 1 ]
                }
            },
            {
                "patchline": {
                    "destination": [ "obj-110", 0 ],
                    "source": [ "obj-112", 0 ]
                }
            },
            {
                "patchline": {
                    "destination": [ "obj-112", 0 ],
                    "source": [ "obj-113", 0 ]
                }
            },
            {
                "patchline": {
                    "destination": [ "obj-9", 0 ],
                    "source": [ "obj-14", 0 ]
                }
            },
            {
                "patchline": {
                    "destination": [ "obj-19", 0 ],
                    "source": [ "obj-15", 0 ]
                }
            },
            {
                "patchline": {
                    "destination": [ "obj-23", 0 ],
                    "source": [ "obj-15", 1 ]
                }
            },
            {
                "patchline": {
                    "destination": [ "obj-79", 0 ],
                    "source": [ "obj-15", 2 ]
                }
            },
            {
                "patchline": {
                    "destination": [ "obj-89", 0 ],
                    "source": [ "obj-15", 3 ]
                }
            },
            {
                "patchline": {
                    "destination": [ "obj-95", 0 ],
                    "source": [ "obj-15", 4 ]
                }
            },
            {
                "patchline": {
                    "destination": [ "obj-9", 0 ],
                    "source": [ "obj-16", 0 ]
                }
            },
            {
                "patchline": {
                    "destination": [ "obj-26", 0 ],
                    "source": [ "obj-17", 0 ]
                }
            },
            {
                "patchline": {
                    "destination": [ "obj-21", 0 ],
                    "source": [ "obj-19", 0 ]
                }
            },
            {
                "patchline": {
                    "destination": [ "obj-12", 0 ],
                    "order": 0,
                    "source": [ "obj-20", 0 ]
                }
            },
            {
                "patchline": {
                    "destination": [ "obj-9", 0 ],
                    "order": 1,
                    "source": [ "obj-20", 0 ]
                }
            },
            {
                "patchline": {
                    "destination": [ "obj-25", 0 ],
                    "source": [ "obj-21", 0 ]
                }
            },
            {
                "patchline": {
                    "destination": [ "obj-17", 0 ],
                    "source": [ "obj-23", 0 ]
                }
            },
            {
                "patchline": {
                    "destination": [ "obj-12", 0 ],
                    "order": 0,
                    "source": [ "obj-25", 0 ]
                }
            },
            {
                "patchline": {
                    "destination": [ "obj-9", 0 ],
                    "order": 1,
                    "source": [ "obj-25", 0 ]
                }
            },
            {
                "patchline": {
                    "destination": [ "obj-20", 0 ],
                    "source": [ "obj-26", 0 ]
                }
            },
            {
                "patchline": {
                    "destination": [ "obj-13", 0 ],
                    "source": [ "obj-3", 1 ]
                }
            },
            {
                "patchline": {
                    "destination": [ "obj-24", 0 ],
                    "source": [ "obj-3", 0 ]
                }
            },
            {
                "patchline": {
                    "destination": [ "obj-53", 0 ],
                    "source": [ "obj-34", 0 ]
                }
            },
            {
                "patchline": {
                    "destination": [ "obj-4", 0 ],
                    "source": [ "obj-35", 0 ]
                }
            },
            {
                "patchline": {
                    "destination": [ "obj-53", 0 ],
                    "source": [ "obj-36", 0 ]
                }
            },
            {
                "patchline": {
                    "destination": [ "obj-76", 0 ],
                    "source": [ "obj-4", 0 ]
                }
            },
            {
                "patchline": {
                    "destination": [ "obj-36", 0 ],
                    "order": 2,
                    "source": [ "obj-40", 0 ]
                }
            },
            {
                "patchline": {
                    "destination": [ "obj-51", 0 ],
                    "order": 1,
                    "source": [ "obj-40", 0 ]
                }
            },
            {
                "patchline": {
                    "destination": [ "obj-60", 0 ],
                    "order": 0,
                    "source": [ "obj-40", 0 ]
                }
            },
            {
                "patchline": {
                    "destination": [ "obj-36", 0 ],
                    "order": 2,
                    "source": [ "obj-41", 0 ]
                }
            },
            {
                "patchline": {
                    "destination": [ "obj-49", 0 ],
                    "order": 1,
                    "source": [ "obj-41", 0 ]
                }
            },
            {
                "patchline": {
                    "destination": [ "obj-61", 0 ],
                    "order": 0,
                    "source": [ "obj-41", 0 ]
                }
            },
            {
                "patchline": {
                    "destination": [ "obj-41", 0 ],
                    "source": [ "obj-44", 0 ]
                }
            },
            {
                "patchline": {
                    "destination": [ "obj-34", 0 ],
                    "order": 2,
                    "source": [ "obj-45", 0 ]
                }
            },
            {
                "patchline": {
                    "destination": [ "obj-47", 0 ],
                    "order": 1,
                    "source": [ "obj-45", 0 ]
                }
            },
            {
                "patchline": {
                    "destination": [ "obj-59", 0 ],
                    "order": 0,
                    "source": [ "obj-45", 0 ]
                }
            },
            {
                "patchline": {
                    "destination": [ "obj-40", 0 ],
                    "source": [ "obj-46", 0 ]
                }
            },
            {
                "patchline": {
                    "destination": [ "obj-54", 0 ],
                    "source": [ "obj-47", 0 ]
                }
            },
            {
                "patchline": {
                    "destination": [ "obj-45", 0 ],
                    "source": [ "obj-48", 0 ]
                }
            },
            {
                "patchline": {
                    "destination": [ "obj-54", 0 ],
                    "source": [ "obj-49", 0 ]
                }
            },
            {
                "patchline": {
                    "destination": [ "obj-54", 0 ],
                    "source": [ "obj-51", 0 ]
                }
            },
            {
                "patchline": {
                    "destination": [ "obj-43", 0 ],
                    "source": [ "obj-53", 0 ]
                }
            },
            {
                "patchline": {
                    "destination": [ "obj-42", 0 ],
                    "source": [ "obj-54", 0 ]
                }
            },
            {
                "patchline": {
                    "destination": [ "obj-63", 0 ],
                    "source": [ "obj-58", 0 ]
                }
            },
            {
                "patchline": {
                    "destination": [ "obj-55", 0 ],
                    "source": [ "obj-59", 0 ]
                }
            },
            {
                "patchline": {
                    "destination": [ "obj-55", 0 ],
                    "source": [ "obj-60", 0 ]
                }
            },
            {
                "patchline": {
                    "destination": [ "obj-55", 0 ],
                    "source": [ "obj-61", 0 ]
                }
            },
            {
                "patchline": {
                    "destination": [ "obj-97", 0 ],
                    "source": [ "obj-62", 0 ]
                }
            },
            {
                "patchline": {
                    "destination": [ "obj-17", 0 ],
                    "order": 1,
                    "source": [ "obj-63", 0 ]
                }
            },
            {
                "patchline": {
                    "destination": [ "obj-21", 0 ],
                    "order": 2,
                    "source": [ "obj-63", 0 ]
                }
            },
            {
                "patchline": {
                    "destination": [ "obj-72", 0 ],
                    "midpoints": [ 558.5, 322.31640625, 587.5, 322.31640625 ],
                    "source": [ "obj-63", 1 ]
                }
            },
            {
                "patchline": {
                    "destination": [ "obj-90", 0 ],
                    "order": 0,
                    "source": [ "obj-63", 0 ]
                }
            },
            {
                "patchline": {
                    "destination": [ "obj-3", 0 ],
                    "source": [ "obj-64", 0 ]
                }
            },
            {
                "patchline": {
                    "destination": [ "obj-74", 0 ],
                    "source": [ "obj-68", 0 ]
                }
            },
            {
                "patchline": {
                    "destination": [ "obj-5", 0 ],
                    "source": [ "obj-69", 0 ]
                }
            },
            {
                "patchline": {
                    "destination": [ "obj-7", 0 ],
                    "source": [ "obj-70", 0 ]
                }
            },
            {
                "patchline": {
                    "destination": [ "obj-21", 0 ],
                    "order": 1,
                    "source": [ "obj-71", 0 ]
                }
            },
            {
                "patchline": {
                    "destination": [ "obj-68", 0 ],
                    "order": 4,
                    "source": [ "obj-71", 0 ]
                }
            },
            {
                "patchline": {
                    "destination": [ "obj-8", 0 ],
                    "order": 3,
                    "source": [ "obj-71", 0 ]
                }
            },
            {
                "patchline": {
                    "destination": [ "obj-84", 0 ],
                    "order": 2,
                    "source": [ "obj-71", 0 ]
                }
            },
            {
                "patchline": {
                    "destination": [ "obj-90", 0 ],
                    "order": 0,
                    "source": [ "obj-71", 0 ]
                }
            },
            {
                "patchline": {
                    "destination": [ "obj-108", 0 ],
                    "order": 0,
                    "source": [ "obj-72", 0 ]
                }
            },
            {
                "patchline": {
                    "destination": [ "obj-78", 0 ],
                    "order": 1,
                    "source": [ "obj-72", 0 ]
                }
            },
            {
                "patchline": {
                    "destination": [ "obj-65", 0 ],
                    "order": 1,
                    "source": [ "obj-73", 0 ]
                }
            },
            {
                "patchline": {
                    "destination": [ "obj-75", 0 ],
                    "order": 0,
                    "source": [ "obj-73", 0 ]
                }
            },
            {
                "patchline": {
                    "destination": [ "obj-16", 0 ],
                    "source": [ "obj-74", 0 ]
                }
            },
            {
                "patchline": {
                    "destination": [ "obj-82", 0 ],
                    "source": [ "obj-76", 0 ]
                }
            },
            {
                "patchline": {
                    "destination": [ "obj-81", 0 ],
                    "source": [ "obj-77", 0 ]
                }
            },
            {
                "patchline": {
                    "destination": [ "obj-73", 0 ],
                    "source": [ "obj-78", 0 ]
                }
            },
            {
                "patchline": {
                    "destination": [ "obj-72", 0 ],
                    "midpoints": [ 611.5, 320.94658435788006, 587.5, 320.94658435788006 ],
                    "source": [ "obj-79", 0 ]
                }
            },
            {
                "patchline": {
                    "destination": [ "obj-14", 0 ],
                    "source": [ "obj-8", 0 ]
                }
            },
            {
                "patchline": {
                    "destination": [ "obj-80", 0 ],
                    "source": [ "obj-81", 0 ]
                }
            },
            {
                "patchline": {
                    "destination": [ "obj-72", 0 ],
                    "source": [ "obj-82", 0 ]
                }
            },
            {
                "patchline": {
                    "destination": [ "obj-79", 0 ],
                    "source": [ "obj-82", 1 ]
                }
            },
            {
                "patchline": {
                    "destination": [ "obj-88", 0 ],
                    "source": [ "obj-84", 0 ]
                }
            },
            {
                "patchline": {
                    "destination": [ "obj-9", 0 ],
                    "source": [ "obj-88", 0 ]
                }
            },
            {
                "patchline": {
                    "destination": [ "obj-84", 0 ],
                    "source": [ "obj-89", 0 ]
                }
            },
            {
                "patchline": {
                    "destination": [ "obj-92", 0 ],
                    "source": [ "obj-90", 1 ]
                }
            },
            {
                "patchline": {
                    "destination": [ "obj-12", 0 ],
                    "order": 0,
                    "source": [ "obj-92", 0 ]
                }
            },
            {
                "patchline": {
                    "destination": [ "obj-9", 0 ],
                    "order": 1,
                    "source": [ "obj-92", 0 ]
                }
            },
            {
                "patchline": {
                    "destination": [ "obj-90", 0 ],
                    "source": [ "obj-95", 0 ]
                }
            },
            {
                "patchline": {
                    "destination": [ "obj-72", 0 ],
                    "midpoints": [ 723.5, 320.5, 587.5, 320.5 ],
                    "source": [ "obj-97", 1 ]
                }
            },
            {
                "patchline": {
                    "destination": [ "obj-72", 0 ],
                    "midpoints": [ 691.5, 320.5, 587.5, 320.5 ],
                    "source": [ "obj-97", 0 ]
                }
            }
        ],
        "parameters": {
            "obj-17": [ "json-output", "json-output", 0 ],
            "obj-21": [ "small-model-mode", "small-model-mode", 0 ],
            "obj-35": [ "live.text[2]", "live.text[2]", 0 ],
            "obj-55": [ "live.button", "live.button", 0 ],
            "obj-62": [ "live.text[3]", "live.text[2]", 0 ],
            "obj-64": [ "port", "port", 0 ],
            "obj-68": [ "timeout", "timeout", 0 ],
            "obj-69": [ "live.text", "live.text", 0 ],
            "obj-70": [ "live.text[1]", "live.text", 0 ],
            "obj-72": [ "sampleFolder", "sampleFolder", 0 ],
            "obj-8": [ "verbose-logs", "verbose-logs", 0 ],
            "obj-84": [ "direct-live-api", "direct-live-api", 0 ],
            "obj-90": [ "notation", "notation", 0 ],
            "parameterbanks": {
                "0": {
                    "index": 0,
                    "name": "",
                    "parameters": [ "-", "-", "-", "-", "-", "-", "-", "-" ],
                    "buttons": [ "-", "-", "-", "-", "-", "-", "-", "-" ]
                }
            },
            "inherited_shortname": 1
        },
        "autosave": 0
    }
}