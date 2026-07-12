## Launch the Project

This project implements all standard chess moves, rules, and basic checks. It features online 1v1 gameplay (open the application in two tabs to play against another person), local 1v1 on the same device, and player vs. bot modes.

### To Do:

- [Develop an AI opponent that makes optimal moves using deep learning techniques](https://github.com/Yasser-Chen/chessGame/issues/7).
- [Secure the application against vulnerabilities](https://github.com/Yasser-Chen/chessGame/issues/4).
- [Add login functionality and user color randomization](https://github.com/Yasser-Chen/chessGame/issues/2).

### Try the App:

You can try the static offline version of the app here:

https://yasser-chen.github.io/Chess-Game/

This version does not include online gameplay features. To test the full local project, follow the running steps below.

### Running the Project:

1.  Install the required dependencies:

    ```bash
    py install 3.10 # optional
    py -3.10 -m venv .venv
    .venv\\Scripts\\activate
    pip install -r requirements.txt
    ```

2.  Start the development server:

    ```bash
    python manage.py runserver
    ```

**Note:** If you experience issues installing the requirements with the above command, try installing each package individually using `pip install [package_name]==[version_number]` and then run the server.
