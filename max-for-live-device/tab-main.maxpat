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
        "rect": [ 698.0, 225.0, 597.0, 604.0 ],
        "openinpresentation": 1,
        "boxes": [
            {
                "box": {
                    "id": "obj-21",
                    "linecount": 2,
                    "maxclass": "message",
                    "numinlets": 2,
                    "numoutlets": 1,
                    "outlettype": [ "" ],
                    "patching_rect": [ 416.0, 435.0, 166.0, 35.0 ],
                    "text": "script sendbox \"Producer Pal update available\" hidden 1"
                }
            },
            {
                "box": {
                    "id": "obj-17",
                    "maxclass": "newobj",
                    "numinlets": 1,
                    "numoutlets": 1,
                    "outlettype": [ "" ],
                    "patching_rect": [ 243.0, 459.0, 75.0, 22.0 ],
                    "text": "prepend text"
                }
            },
            {
                "box": {
                    "id": "obj-20",
                    "linecount": 2,
                    "maxclass": "newobj",
                    "numinlets": 4,
                    "numoutlets": 2,
                    "outlettype": [ "", "" ],
                    "patching_rect": [ 243.0, 411.0, 137.0, 35.0 ],
                    "text": "combine v X.Y.Z \" \" available @triggers 1"
                }
            },
            {
                "box": {
                    "id": "obj-24",
                    "linecount": 2,
                    "maxclass": "message",
                    "numinlets": 2,
                    "numoutlets": 1,
                    "outlettype": [ "" ],
                    "patching_rect": [ 136.5, 535.0, 363.0, 35.0 ],
                    "text": ";\rmax launch_browser https://producer-pal.org/installation/upgrading"
                }
            },
            {
                "box": {
                    "id": "obj-15",
                    "maxclass": "newobj",
                    "numinlets": 1,
                    "numoutlets": 2,
                    "outlettype": [ "bang", "" ],
                    "patching_rect": [ 391.0, 290.0, 29.5, 22.0 ],
                    "text": "t b l"
                }
            },
            {
                "box": {
                    "id": "obj-14",
                    "maxclass": "newobj",
                    "numinlets": 1,
                    "numoutlets": 2,
                    "outlettype": [ "", "" ],
                    "patching_rect": [ 391.0, 381.0, 67.0, 22.0 ],
                    "save": [ "#N", "thispatcher", ";", "#Q", "end", ";" ],
                    "text": "thispatcher"
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
                    "patching_rect": [ 391.0, 329.0, 166.0, 35.0 ],
                    "text": "script sendbox \"Producer Pal update available\" hidden 0"
                }
            },
            {
                "box": {
                    "annotation": "Click to get the latest version.",
                    "bgcolor": [ 0.596078431372549, 0.933333333333333, 1.0, 1.0 ],
                    "fontface": 0,
                    "hidden": 1,
                    "hint": "",
                    "id": "obj-12",
                    "maxclass": "textbutton",
                    "numinlets": 1,
                    "numoutlets": 3,
                    "outlettype": [ "", "", "int" ],
                    "parameter_enable": 0,
                    "patching_rect": [ 243.0, 497.0, 100.0, 20.0 ],
                    "presentation": 1,
                    "presentation_rect": [ 147.0, 4.0, 101.0, 22.0 ],
                    "rounded": 8.0,
                    "text": "Update available",
                    "textoncolor": [ 0.129411764705882, 0.129411764705882, 0.129411764705882, 1.0 ],
                    "textovercolor": [ 0.231372549019608, 0.03921568627451, 0.72156862745098, 1.0 ],
                    "underline": 1,
                    "usetextovercolor": 1,
                    "varname": "Producer Pal update available"
                }
            },
            {
                "box": {
                    "id": "obj-11",
                    "maxclass": "newobj",
                    "numinlets": 0,
                    "numoutlets": 1,
                    "outlettype": [ "" ],
                    "patching_rect": [ 391.0, 257.0, 116.0, 22.0 ],
                    "text": "r ---update-available"
                }
            },
            {
                "box": {
                    "bgmode": 0,
                    "border": 0,
                    "clickthrough": 1,
                    "enablehscroll": 0,
                    "enablevscroll": 0,
                    "id": "obj-4",
                    "lockeddragscroll": 0,
                    "lockedsize": 0,
                    "maxclass": "bpatcher",
                    "name": "server-status.maxpat",
                    "numinlets": 0,
                    "numoutlets": 0,
                    "offset": [ 0.0, 0.0 ],
                    "patching_rect": [ 24.0, 91.0, 198.0, 71.0 ],
                    "presentation": 1,
                    "presentation_rect": [ 28.0, 31.0, 213.0, 75.0 ],
                    "viewvisibility": 1
                }
            },
            {
                "box": {
                    "fontface": 1,
                    "fontname": "Ableton Sans Bold",
                    "fontsize": 9.0,
                    "id": "obj-10",
                    "maxclass": "comment",
                    "numinlets": 1,
                    "numoutlets": 0,
                    "patching_rect": [ 46.0, 52.0, 86.0, 17.0 ],
                    "presentation": 1,
                    "presentation_rect": [ 172.0, 27.0, 24.0, 17.0 ],
                    "text": "TM",
                    "textjustification": 1
                }
            },
            {
                "box": {
                    "annotation": "Open the built-in AI chat UI in a web browser.",
                    "annotation_name": "Open Chat UI",
                    "fontsize": 10.0,
                    "id": "obj-32",
                    "maxclass": "live.text",
                    "mode": 0,
                    "numinlets": 1,
                    "numoutlets": 2,
                    "outlettype": [ "", "" ],
                    "parameter_enable": 1,
                    "patching_rect": [ 31.0, 344.0, 83.0, 24.0 ],
                    "presentation": 1,
                    "presentation_rect": [ 85.0, 125.0, 80.0, 20.0 ],
                    "saved_attribute_attributes": {
                        "valueof": {
                            "parameter_enum": [ "val1", "val2" ],
                            "parameter_invisible": 2,
                            "parameter_longname": "live.text[3]",
                            "parameter_mmax": 1,
                            "parameter_modmode": 0,
                            "parameter_shortname": "live.text[3]",
                            "parameter_type": 2
                        }
                    },
                    "text": "Open Chat UI",
                    "varname": "open-chat-ui"
                }
            },
            {
                "box": {
                    "angle": 270.0,
                    "annotation": "Open the built-in AI chat UI in a web browser.",
                    "bgcolor": [ 0.163688058058427, 0.163688010157025, 0.163688022674427, 0.0 ],
                    "hint": "",
                    "id": "obj-63",
                    "ignoreclick": 0,
                    "maxclass": "panel",
                    "mode": 0,
                    "numinlets": 1,
                    "numoutlets": 0,
                    "patching_rect": [ 123.66667035222054, 168.00000500679016, 128.0, 128.0 ],
                    "presentation": 1,
                    "presentation_rect": [ 70.00000208616257, 119.499999538064, 113.66667005419731, 28.50000487267971 ],
                    "proportion": 0.39,
                    "varname": "Open Chat UI"
                }
            },
            {
                "box": {
                    "id": "obj-5",
                    "linecount": 2,
                    "maxclass": "live.comment",
                    "numinlets": 1,
                    "numoutlets": 0,
                    "patching_rect": [ 188.0, 202.0, 150.0, 29.0 ],
                    "presentation": 1,
                    "presentation_linecount": 2,
                    "presentation_rect": [ 181.0, 118.0, 69.0, 29.0 ],
                    "text": "© 2026 \nAdam Murray",
                    "textjustification": 1
                }
            },
            {
                "box": {
                    "id": "obj-13",
                    "maxclass": "newobj",
                    "numinlets": 0,
                    "numoutlets": 1,
                    "outlettype": [ "" ],
                    "patching_rect": [ 154.0, 302.0, 48.0, 22.0 ],
                    "text": "r ---port"
                }
            },
            {
                "box": {
                    "id": "obj-71",
                    "linecount": 2,
                    "maxclass": "newobj",
                    "numinlets": 1,
                    "numoutlets": 1,
                    "outlettype": [ "" ],
                    "patching_rect": [ 154.0, 339.0, 171.0, 35.0 ],
                    "text": "sprintf \\; max launch_browser http://localhost:%d/chat"
                }
            },
            {
                "box": {
                    "id": "obj-35",
                    "linecount": 3,
                    "maxclass": "message",
                    "numinlets": 2,
                    "numoutlets": 1,
                    "outlettype": [ "" ],
                    "patching_rect": [ 31.0, 390.0, 142.0, 49.0 ],
                    "text": ";\rmax launch_browser http://localhost:3350/chat"
                }
            },
            {
                "box": {
                    "id": "obj-8",
                    "maxclass": "newobj",
                    "numinlets": 1,
                    "numoutlets": 1,
                    "outlettype": [ "" ],
                    "patching_rect": [ 267.0, 123.0, 72.0, 22.0 ],
                    "text": "prepend set"
                }
            },
            {
                "box": {
                    "id": "obj-2",
                    "linecount": 2,
                    "maxclass": "newobj",
                    "numinlets": 2,
                    "numoutlets": 2,
                    "outlettype": [ "", "" ],
                    "patching_rect": [ 267.0, 75.0, 102.0, 35.0 ],
                    "text": "combine v X.Y.Z @triggers 1"
                }
            },
            {
                "box": {
                    "autofit": 1,
                    "forceaspect": 1,
                    "id": "obj-54",
                    "maxclass": "fpic",
                    "numinlets": 1,
                    "numoutlets": 1,
                    "outlettype": [ "jit_matrix" ],
                    "patching_rect": [ 2.0, 14.0, 65.0, 45.5 ],
                    "pic": "producer-pal-logo.svg",
                    "presentation": 1,
                    "presentation_rect": [ 13.0, 17.0, 49.99999934434891, 34.99999954104423 ]
                }
            },
            {
                "box": {
                    "id": "obj-19",
                    "linecount": 2,
                    "maxclass": "message",
                    "numinlets": 2,
                    "numoutlets": 1,
                    "outlettype": [ "" ],
                    "patching_rect": [ 46.0, 239.0, 240.0, 35.0 ],
                    "text": ";\rmax launchbrowser https://producer-pal.org"
                }
            },
            {
                "box": {
                    "annotation": "Open the Producer Pal documentation website",
                    "id": "obj-18",
                    "maxclass": "textbutton",
                    "numinlets": 1,
                    "numoutlets": 3,
                    "outlettype": [ "", "", "int" ],
                    "parameter_enable": 0,
                    "patching_rect": [ 46.0, 200.0, 63.0, 21.0 ],
                    "presentation": 1,
                    "presentation_rect": [ 0.0, 125.0, 65.0, 20.0 ],
                    "text": "📚  Docs",
                    "varname": "Producer Pal Documentation"
                }
            },
            {
                "box": {
                    "id": "obj-7",
                    "maxclass": "newobj",
                    "numinlets": 0,
                    "numoutlets": 1,
                    "outlettype": [ "" ],
                    "patching_rect": [ 302.0, 38.0, 67.0, 22.0 ],
                    "text": "r ---version"
                }
            },
            {
                "box": {
                    "fontname": "Ableton Sans Medium",
                    "id": "obj-23",
                    "maxclass": "comment",
                    "numinlets": 1,
                    "numoutlets": 0,
                    "patching_rect": [ 267.0, 154.0, 78.0, 21.0 ],
                    "presentation": 1,
                    "presentation_rect": [ 182.0, 39.0, 67.0, 21.0 ],
                    "text": "vX.Y.Z",
                    "textjustification": 0
                }
            },
            {
                "box": {
                    "fontface": 1,
                    "fontname": "Ableton Sans Bold",
                    "fontsize": 24.0,
                    "id": "obj-3",
                    "maxclass": "comment",
                    "numinlets": 1,
                    "numoutlets": 0,
                    "patching_rect": [ 31.0, 37.0, 163.0, 35.0 ],
                    "presentation": 1,
                    "presentation_rect": [ 25.0, 28.0, 177.0, 35.0 ],
                    "text": "roducer Pal",
                    "textjustification": 1
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
                    "patching_rect": [ 204.0, 40.0, 34.0, 29.0 ],
                    "presentation": 1,
                    "presentation_rect": [ 0.0, -2.0, 250.0, 150.0 ],
                    "proportion": 0.39,
                    "rounded": 0
                }
            }
        ],
        "lines": [
            {
                "patchline": {
                    "destination": [ "obj-15", 0 ],
                    "source": [ "obj-11", 0 ]
                }
            },
            {
                "patchline": {
                    "destination": [ "obj-24", 0 ],
                    "source": [ "obj-12", 0 ]
                }
            },
            {
                "patchline": {
                    "destination": [ "obj-71", 0 ],
                    "source": [ "obj-13", 0 ]
                }
            },
            {
                "patchline": {
                    "destination": [ "obj-20", 1 ],
                    "source": [ "obj-15", 1 ]
                }
            },
            {
                "patchline": {
                    "destination": [ "obj-53", 0 ],
                    "source": [ "obj-15", 0 ]
                }
            },
            {
                "patchline": {
                    "destination": [ "obj-12", 0 ],
                    "source": [ "obj-17", 0 ]
                }
            },
            {
                "patchline": {
                    "destination": [ "obj-19", 0 ],
                    "source": [ "obj-18", 0 ]
                }
            },
            {
                "patchline": {
                    "destination": [ "obj-8", 0 ],
                    "source": [ "obj-2", 0 ]
                }
            },
            {
                "patchline": {
                    "destination": [ "obj-17", 0 ],
                    "source": [ "obj-20", 0 ]
                }
            },
            {
                "patchline": {
                    "destination": [ "obj-14", 0 ],
                    "source": [ "obj-21", 0 ]
                }
            },
            {
                "patchline": {
                    "destination": [ "obj-35", 0 ],
                    "source": [ "obj-32", 0 ]
                }
            },
            {
                "patchline": {
                    "destination": [ "obj-14", 0 ],
                    "source": [ "obj-53", 0 ]
                }
            },
            {
                "patchline": {
                    "destination": [ "obj-2", 1 ],
                    "source": [ "obj-7", 0 ]
                }
            },
            {
                "patchline": {
                    "destination": [ "obj-35", 1 ],
                    "source": [ "obj-71", 0 ]
                }
            },
            {
                "patchline": {
                    "destination": [ "obj-23", 0 ],
                    "source": [ "obj-8", 0 ]
                }
            }
        ],
        "parameters": {
            "obj-32": [ "live.text[3]", "live.text[3]", 0 ],
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