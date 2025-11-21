const PPAL_CREATE_CLIP = "ppal-create-clip";

export const parallelToolCallHistory = [
  {
    role: "user",
    parts: [
      {
        text: "Can you create an empty clip in the first two tracks in the first scene at THE SAME TIME?",
      },
    ],
  },
  {
    role: "model",
    parts: [
      {
        text: '**Constructing the Scene**\n\nI\'m now devising the logic for populating the first scene with empty clips.  I\'ll call `ppal-create-clip` twice for the "Drums" and "Bass" tracks, targeting track indices 0 and 1, within scene index 0. This seems straightforward using the function.\n\n\n**Formulating the Implementation**\n\nI\'ve decided to proceed with calling `ppal-create-clip` twice, once for the "Drums" track at index 0, and again for the "Bass" track at index 1, both within scene index 0. The default clip length will be 4 beats, aligning with a one-bar duration, which seems adequate. I\'m focusing on the logic, confident in the function\'s capabilities.\n\n\n',
        thought: true,
      },
      {
        functionCall: {
          name: PPAL_CREATE_CLIP,
          args: {
            name: "Empty Clip Drums",
            length: "1:0",
            view: "session",
            trackIndex: 0,
            sceneIndex: 0,
          },
        },
        thoughtSignature:
          "CiQB0e2Kb3CrFbnpxOjOcv0jxNSiA/+/niDWYpZIP8doD4DE8W0KZwHR7YpvahVVbob76s9JcIG3EO96Z+i+hs5imcjHdmB/+WLs3ssuVTGtMYSiyDIfAov+NHPOUh1TugYWBCllYd8S1dtycN+vO9PmXowEVOI+7TUQ2AW2RUEF7HwunYb+4ix5tCKHo3kKxwEB0e2Kb4DCoVRyVcWKujBvV+P/0osjtkNgXuNuw2X2ZIFFevr+lLR2PDe0EQyNXWWqm0uHgz5A6/l/3XM4BwyNhtBTSjgHJpwP2+o1WF9KHIpQFUI5kplFmgAWeXA2UFIg7MPn0q+thBaSsbGYlO83VCQ0jjr4ATMqNE4Zmr2rkzLno+jWo8g6yuMdVpJJBats0rYdg4qGctuFL8B1bMdw9IlUTFuxP9ce3x4TGJ/WLag4zSDSNIH3vSfh6W5Vj+856YRFNJB4CvIBAdHtim83+hb1f9+1yt9+ergcKD0VVJqNKvKRxGhOtXa3fE2vgj1OBd/dVj9I9DfzLuY2dsTuJ8UN9T6t9gQu7+4uzKMNx24OUq/Nqf4ni8WOx9r7kEhizv2SflG8P8TUBF78hoRO7/HIAGZZzkOSq/RMKuLADHhA3boF1kD9BxP0LixSSPXpjxf3ELDarUAhghvwvSPv6VqLOIlTB1sxlr9dsX3zYhBcoUANvi5y4UsB//yGzoycvb2kdAI7eEj6jTisUbZBILpOR5BqDYgTuzDn1FDVXPzuEq6i4ZPc6/uacjPDQIiPqP5XiYDhPiqMcLAKiAEB0e2KbyJxVir92tSNj5ZnyykAtHp2jk8EvotTltlrzHEIaUOfiLfBY/iMGML9Vkcs75m/76qoTM0myjF0U1k88gqJpTNIvzcCZ4iyTGPffU447eGwLakXgZiGxOE2gwZEevXec1wvbtqc1LuUePEAt4rMZu4lFZYDCBd+IeBU22XW0A8QfCCx",
      },
      {
        functionCall: {
          name: PPAL_CREATE_CLIP,
          args: {
            view: "session",
            sceneIndex: 0,
            trackIndex: 1,
            name: "Empty Clip Bass",
            length: "1:0",
          },
        },
      },
    ],
  },
  {
    role: "user",
    parts: [
      {
        functionResponse: {
          name: PPAL_CREATE_CLIP,
          response: {
            content: [
              {
                type: "text",
                text: '{id:"592",trackIndex:0,sceneIndex:0}',
              },
            ],
          },
        },
      },
      {
        functionResponse: {
          name: PPAL_CREATE_CLIP,
          response: {
            content: [
              {
                type: "text",
                text: '{id:"593",trackIndex:1,sceneIndex:0}',
              },
            ],
          },
        },
      },
    ],
  },
  {
    role: "model",
    parts: [
      {
        text: 'I\'ve created an empty clip named "Empty Clip Drums" in the first scene on the "Drums" track and an empty clip named "Empty Clip Bass" in the first scene on the "Bass" track.',
      },
    ],
  },
];

export const expected = [
  {
    role: "user",
    parts: [
      {
        type: "text",
        content:
          "Can you create an empty clip in the first two tracks in the first scene at THE SAME TIME?",
      },
    ],
    rawHistoryIndex: 0,
  },
  {
    role: "model",
    parts: [
      {
        type: "thought",
        content:
          '**Constructing the Scene**\n\nI\'m now devising the logic for populating the first scene with empty clips.  I\'ll call `ppal-create-clip` twice for the "Drums" and "Bass" tracks, targeting track indices 0 and 1, within scene index 0. This seems straightforward using the function.\n\n\n**Formulating the Implementation**\n\nI\'ve decided to proceed with calling `ppal-create-clip` twice, once for the "Drums" track at index 0, and again for the "Bass" track at index 1, both within scene index 0. The default clip length will be 4 beats, aligning with a one-bar duration, which seems adequate. I\'m focusing on the logic, confident in the function\'s capabilities.\n\n\n',
      },
      {
        type: "tool",
        name: PPAL_CREATE_CLIP,
        args: {
          name: "Empty Clip Drums",
          length: "1:0",
          view: "session",
          trackIndex: 0,
          sceneIndex: 0,
        },
        result: '{id:"592",trackIndex:0,sceneIndex:0}',
      },
      {
        type: "tool",
        name: PPAL_CREATE_CLIP,
        args: {
          view: "session",
          sceneIndex: 0,
          trackIndex: 1,
          name: "Empty Clip Bass",
          length: "1:0",
        },
        result: '{id:"593",trackIndex:1,sceneIndex:0}',
      },
      {
        type: "text",
        content:
          'I\'ve created an empty clip named "Empty Clip Drums" in the first scene on the "Drums" track and an empty clip named "Empty Clip Bass" in the first scene on the "Bass" track.',
      },
    ],
    rawHistoryIndex: 1,
  },
];
