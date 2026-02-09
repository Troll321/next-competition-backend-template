**—- API AND BACKEND SPEC —-**

Verifiable Spec:

- Each Verifiable has a verified property which is not null default 0, with values meaning: **✅**
    - \-1 Rejected
    - 0 Pending
    - 1 Requested
    - 2 Accepted

- Each Verifiable has a message_subject and message_body which both are not null default ''. This is useful for commenting on rejection or commenting on approval. **✅**

Submission Spec:

- Each submission has a locked property which is not null default 0, with values meaning: **✅**
    - 0 not locked
    - 1 locked
    - 2 locked + reviewed

Payment Spec:

- Payment is attached to a constraint name (same as upload) **✅**
- The payment saves 3 things: status;;;UnixDate;;;data. If null then the payment hasn't been attempted yet **✅**
- Status could be 2: **pending** or **paid**. If pending then UnixDate is expirationTime and data is paymentUrl. If paid then UnixDate is the date of payment and data is the txHash.
- There should also be a webhook and adapters to getPaymentURL and verifyWebhook with should then update the respective row

Submittable Rule:

- Lets differentiate submittable and submission **✅**
- Submittable has a datatype of array of obj (the same as Verifiable). With each index representing level from 1 → N. **✅**
- Each submittable has a **verifiable** property which is a slug of the verifiable that could submit this. **✅**
- Submittable can only be submitted by a verifiable that is verified **✅**
- Each submission has a **locked** property (boolean default false not null) **✅**
- Each submission has a **level** property that specifies which level is performed right now, default 1. **✅**
- Each submission has a **verifiableId** property **✅**
- The submission is a document in a self managed MongoDB collection that mimics the submission schema. (This contains all level and property) **✅**
- For a submittable a verifiable could only have 1 submission! **✅**
- Each verifiable could only access (includes update and get) where verifiableId = to his **✅**
- **updateSubmission(verifiable, verifiableId, submittable)** is exposed which will: **✅**
    - Automatically create the docs if non existent**✅**
    - Call to this will always target the _level_ index submission**✅** 
    - If level exceed Submittable length then throw**✅**
    - If locked then throw**✅**
    - If user does not have access to the verifiableId then throw (referred as auth) **✅**

- Submission can’t be deleted **✅**
- **lockSubmission** makes it eligible for screening and set locked to true. Spec:**✅**
    - Same parameter**✅**
    - Same auth**✅**
    - Same throw condition**✅**
    - All constraint must be not null**✅**

- Reject and Accept is still the same as Verifiable and can be queried by **getSubmission**, the authorization is the same as that of updateSubmission
- Accept will update the level index by 1, if already maxlevel then locked will be 2

Upload Rule:

- Rate limit the preview URL creation and the uploadFile **✅**

Rule for Verify Authorization:

- Each Verifiable has a creator (which is an email) and a shared (which is a list of email), we call this **accessor ✅**
- Each Verifiable has is **singleton** property that dictates that each user can only _**access**_ 1 doc ✅
- Each Verifiable has a **max_shared** property ✅
- Each CRUD operations can only affect document that is created or shared ✅
- All CRUD operations skip authorization if the **\_isFromServer** flag is true and may add additional feature ✅
- Verifiable can depends on other Verifiable ✅
- Each Verifiable thus has a **depends_on** property which is a **slug** for _**another**_ Verifiable (if null or empty string thus it doesn't depend on anything) ✅
- Each Verifiable has a **depended_by** property which is an **array of slug** of another Verifiable (this is automatically updated by the system when depends_on is set) ✅
- Document can only be requested for verification IFF: ✅
    - 1\. All constraints is not null ✅
    - 2\. All of the depends*on docs (plural) of all the \_accessor* is has verified level minimal of 1 (i.e. \[table depends*on\] → \[creator/shared \_accessor*\] → All Docs Verified) ✅
    - 3\. Not already verified ✅

- If a document is rejected then all of its depended_by are also rejected. (Message comments may differ)
- If a document is approved then all of its depends*on of all the \_accessor* that has a verified level of 1 is also accepted. (Message comments may differ)
- A document that has verified level of minimal 1 CAN'T BE CHANGED (change is update and delete operations) ✅
- Deletion of a document can only be done IFF:
    - 1\. verified level < 1  ✅
    - 2\. all of depended*by documents that have the \_accessor* as an _accessor_ is also deleted / empty ✅
    - 3\. Be done by the creator (not accessor)✅

- Unshare can be done by the creator, but an _accessor_ can ONLY unshare itself ✅
- Share can only be done if in the end the shared is <= max_shared AND a verifiable could add itself to the shared list by using the generated code from the server (other than this can't) ✅
- Shared cannot include the creator of the docs✅
- Shared verifiable can only be accepted if depends_on docs verified level >= min(1, to be shared Verifiable) ✅
- Share should always comply to the singleton check **✅**

**—- UI COMPONENT SPEC —-**

**Verifiable Form Spec:**

- This spec is written using the following conventions, if a function returns a promise it should always be assumed that we use await to call it
- Each function have a suffix \_S for server components \_C for client components and \_SC if can be used in both
- Constraints (or Field) for the current verifiable is attained through the getConstraints (slug) function, this will output a Verifiable–assuming that the slug given is valid–then we access the .constraints and .required_on_create for all the fields, the slug is passed in the parameter
- Below the field the form has 3 button, a requestVerify button, a save button, and a delete ${slug} button (this will be elaborated further)
- if the doc of the verifiable (will be shorted to doc from now on) exists it should display the form along with the constraints that is already filled with the value of the doc, the doc is attained by accessing the (await readDoc(slug, {}))\[0\], (if undefined then it doesn't exists)
- If doc doesn't exist it should also display the form with the fields but empty and a "Create new ${slug}" button is displayed. This button if pressed will call createDoc(slug, {}). We then query (await getDoc(slug, {}))\[0\] again to set our current doc to.
- A disabled form meaning, we can't change the value of the form nor can we use the save button and the request for verify button (the UI should make this clear, by making the button field a bit grey like usual disabled input). Important: When form is disabled the text value should be visible not opaque.
- A form is disabled when there is no doc exists (pressing the createDoc button will break this condition as it set the current doc to the newly created one)
- A form is also disabled when the doc.verified level is >= 1, but when doc.verified == 2 then the form is still disabled but the form field can be clearly looked at (i.e. not grey background).
- At the top of the form there is a status bar that receives a verifiedLevel params which is passed the doc.verified property. verifiedLevel is a number ranging from -1 to 2 inclusive. At -1 it should signal that the doc is rejected, 0 is not yet requested for verification, 1 is requested, 2 is accepted
- If the doc.message_subject or doc.message_body is set then display it on the form (this act as a feedback by admin, style this appropriately) if one or two of them has the value of "" then it is assumed that there are no message and the subject or message (this acts separately) should not be shown
- Elaborating on the save button. At first it is disabled which means it could not be pressed (UI should make this clear), but after the user changes a field it will become not disabled. If this button is pressed then it will call updateDoc(slug, InsertObj, {}). We define InsertObj as an obj with key pair value with each key is the name of the constraints (or field that we get before) and the value is the value for that field. This insertObj will include all of the constraints EXCEPT for the payment and file type. After calling the updateDoc we then iterate over all the "file" type fields. The file type fields should maintain if it been uploaded a file or not, if it is not then ignore, if it has been uploaded a file by the user then it will call then call await uploadFileToVerifiable(slug, [doc.id](http://doc.id), theConstraintName, theNewlyUploadedFile). The UI will set the field to be the saved value.
- Elaborating on the file type field: it will also receive 2 additional parameters maxInputSizeKb (constraints\[i\].max_input_size_kb as number) and mimeTypes (constraints\[i\].mime_type as string\[\]) the uploaded file should only accept the specified mimeTypes and have file size < maxInputSizeKb. When the file is already chosen by the file picker and not yet uploaded (i.e. the user hasn't pressed the save button) it could show the preview of the file if it has image MIMEType (e.g. png, jpg, jpeg, webp) and also preview the name and the size if applicable.
- If a user wants to preview an already uploaded file (i.e.the fields already has value when requested) it first will call decodeFilePath_SC(decodeSQLURL_SC(value).path) then this will output userId (the email of the owner), time (when the file uploaded), and fileName, display this information. There is also a preview file button which if pressed will call the getVerifiableFileInfo(slug, [doc.id](http://doc.id), fieldName) which will return FileInfo and use this info to display it to the user. It also has a signedUrl property which could be used to download the file if the user wants to.
- After the user press the save button, you can release the File handler and then update the value to be what you get from the uploadFileToVerifiable
- Elaborating on the requestVerify button. As explained above if doc.verified >= 1 then this button is disabled. But also at first this button is disabled by default, it will only become not disabled IFF these 3 requirements are met: 1. All constraints is not null 2. Not already verified 3. If the doc.depends_on is truthy then we iterate over the accesorArr= \[doc.creator, …doc.shared\] then we call isAccessorVerified(doc.depends_on, accessorArr\[i\]), this will output the verified level for each of the accessor, the UI should display this (display since the element is loaded not when the button is pressed), if all of the verifiedLevel of the accessors >= 1  then this requirement is met. If doc.depends_on is falsy then requirement 3 is always true. The requestVerify button should only lights up if the form has been saved not when editing
- If the requestVerifyButton is pressed then it will call requestVerify(slug, [doc.id](http://doc.id)) then we on the client (the doc state) set the doc.verified to be 1 (this is to disable the form)

Extension:

- On the first time the form load it should check for whether the user has already logged in or not, this is done by set the current user variable / state to useUser_C().user (this function will return an object {user, isLoading} the UI could handle the isLoading by suspending the UI or just let it go in the background (choose the best for UX)). If the user after isLoading becomes false still yields undefined / null (falsy value) OR user?.email_verified is falsy then there should be a notice to login first and the form will be disabled and will not run any of the functions except populating the field with getConstraints (the procedure for populating is stated above), this is done due to other functions requiring a user. As a side after this if referencing user.email it is assumed to be always exists
- The verifiableForm has a join {slug} button which will show alongside the create {slug} button (this join button should also disappear if the create button disappears, it is when doc exists). The join button comes in a packet with a predefined text input TT . XXXX. This predefined text input should only accept alphanumeric and convert all lowercase letters to uppercase (this checking and conversion is done live as the user is inputting, if rejected then changes are not reflected). The UI should show the dot separator and make this similar to code input UI (e.g. Gmail verify code input, Github 2FA code input). By default the join button is disabled and could only light up if all of the code input is already filled. If the join button is pressed it will call joinWithVerifiableCode(theCode), theCode is the inputted code (this includes also the dot ".", so end format will be "TT.XXXX"). After the call you then call (use await readDoc(slug, {}))\[0\] and set the current doc accordingly.
- Elaborating on the verified level of each accessor that has already attained, the UI should display each of the email of the accessor (i.e. accessorArr\[i\]) and its verified level. But the verified level should be mapped instead of a number; it should display a chip that has different text and color depending on the verifedLevel.
- On the side of the accessor display email the UI should display whether it is the creator of the verifiable or  "you" the user currently accessing. To check whether it is the creator just use accessorArr\[i\] === doc.creator. To check whether it is "you" just check whether user.email === accessorArr\[i\]
- More elaborating on the delete button, this should only light up IFF user.email === doc.creator else then this button is disabled
- The verifiableForm, if the doc exists, have a kick member and leave button which is to be elaborated
- Elaborating on the kick member button, this button is disabled and only not disabled when user.email === doc.creator (current user is the creator). This kick member lies on the side of each accessor, who is not the creator, email display. This button is read with white X text (though could be restyled accordingly). If the button is pressed it will call shareDoc(slug, \[\], \[accessorArr\[i\]\])
- Elaborating on the leave button and the delete button. The leave button is an alternative to the delete button. The delete button will only show up / exist only if the current user is the owner, if not then the leave button will show up / exist. The delete is disabled when the verifiedLevel >= 1. The leave button is always lit up (not disabled) and if pressed will call shareDoc(slug, \[\], user.email) and then will set the doc to be non-existent either undefined or null then we go back to the first state.
- The verifiableForm should also display a {slug} code which is the doc.verifiableCode
- The text input should validate the input by checking (new Blob(value).size) \* 1024 should always <= max_input_kb
- On every fields if the constraints\[i\].ui_title is defined then the title of the field is ui_title if doesnt exists then use the name, in addition to that if the constraints\[i\].ui_descriptions exists then the field should display it below the title (exists for ui_description and ui_title is truthy and value !== “”)

Fix and clarification:

- Make sure the dependency status is not outputting undefined on the verifiedLevel after sharing
- Add a caching mechanism in which the components should accept all states as params with param naming convention \_stateName and optional. If the param exists dont query and use the given param if undefined then do as what is already instructed.

Submission Form Spec:

- This spec is written using the following conventions, if a function returns a promise it should always be assumed that we use await to call it
- Each function have a suffix \_S for server components \_C for client components and \_SC if can be used in both
- The submission components should display “basic info” and levels along with the fields (alternatively called constraints) of each levels. This 2 are to be elaborated below.
- Each Submission Form component should fetch this variable / state: 1. The submit is done by fetching getSubmission(docId, submittableSlug).submittable, the docId and submittableSlug is passed on from the params. 2. The submission (differentiate these from submittable), this is done by fetching getSubmission(docId, submittableSlug).submission (in practice only call the function once, just as getting submittable, but accessing the different property). 3. The one who make the submission (called doc) by fetching (await readDoc(submittable.verifiable, { id: docId }))\[0\]
- Now it is safe to assume doc and submittable always exists because failing to to do so would yield in an error thrown by the fetching function. The submission could be null meaning the user hasn't made a ny submission (we call this condition the submission does not exists)
- The submission should be disabled when doc.verified !== 2
- Elaborating on basic info, it should display “${submittableSlug} submission by ${doc.slug} code ${doc.verifiableCode}”. It also displays the locked status by accessing submission.locked: 0 means unlocked, 1 means locked, 2 mean locked and reviewed. It should also display the current level by accessing submission.level
- Elaborating on the fields. The components should display form like fields for each constraints for each level. Level array is submittable.levels (this is different from submittable.level) then on each submittable.levels\[i\].constraints (refer to this as levelConstraintsArr) contains the constraints / fields (i.e that is an object with the following property levelConstraintsArr\[j\] = { name, type, max_input_kb, ui_title, ui_description }. The fields should handle multiple fied type: number, text, file (to be elaborated), payment, boolean. Each field (whatever type) should display ui_title as title if exists, if ui_title doesn't exits then use name, below that if ui_description exists display ui_description (exists for ui_description and ui_title is truthy and value !== “”) below that is the actual input field that is specific towards each type.
- If the submission.message_subject or submission.message_body is set then display it on the form (this act as a feedback by admin, style this appropriately) if one or two of them has the value of "" then it is assumed that there are no message and the subject or message (this acts separately) should not be shown
- Below the form there is a save button. At first it is disabled which means it could not be pressed (UI should make this clear), but after the user changes a field it will become not disabled. If this button is pressed then it will call updateSubmission(doc.id, submittableSlug, InsertObj). We define InsertObj as an obj with key pair value with each key is the name of the constraints (or field that we get before) and the value is the value for that field. This insertObj will include all of the constraints EXCEPT for the payment and file type. After calling the updateDoc we then iterate over all the "file" type fields. The file type fields should maintain if it been uploaded a file or not, if it is not then ignore, if it has been uploaded a file by the user then it will call then call await uploadFileToSubmission([doc.id](http://doc.id), submittableSlug, theConstraintName, theNewlyUploadedFile). The UI will set the field to be the saved value.
- Elaborating on the file type field: it will also receive 2 additional parameters maxInputSizeKb (levelConstraintsArr\[i\].max_input_size_kb as number) and mimeTypes (levelConstraitsArr\[i\].mime_type as string\[\]) the uploaded file should only accept the specified mimeTypes and have file size < maxInputSizeKb. When the file is already chosen by the file picker and not yet uploaded (i.e. the user hasn't pressed the save button) it could show the preview of the file if it has image MIMEType (e.g. png, jpg, jpeg, webp) and also preview the name and the size if applicable.
- If a user wants to preview an already uploaded file (i.e.the fields already has value when requested) it first will call decodeFilePath_SC(decodeSQLURL_SC(value).path) then this will output userId (the email of the owner), time (when the file uploaded), and fileName, display this information. There is also a preview file button which if pressed will call the getSubmissionFileInfo(doc.id, submittableSlug, fieldName) which will return FileInfo and use this info to display it to the user. It also has a signedUrl property which could be used to download the file if the user wants to.
- After the user press the save button, you can release the File handler and then update the value to be what you get from the uploadFileToSubmission
- Elaborating on the lock button. The lock button text display is submitted but we refer to this as the lock button. If submission.locked >= 1 then this button is disabled. But also at first this button is disabled by default, it will only become not disabled IF these 3 requirements are met: 1. All constraints are not null 2. Not already locked 3. The form is not disabled (i.e doc.verified < 2)
- If the lock submission button  is pressed then it will call lockSubmission(doc.id submittableSlug) then we on the client (the submission state) set the submission.locked to be 1 (this is to disable the form)
- For each level that has index < submission.level-1 then it should be assumed that the value already exists for all constraints for that level and should already be locked (or disabled), please note that the locked and save button is only 1 which is at the very bottom and the action always refers to the latest level. If submission.level > submittables.levels.length then the form and lock button is ALWAYS disabled
- The text input should validate the input by checking (new Blob(value).size) \* 1024 should always <= max_input_kb

Fix and clarifications:

- docId as a params is optional, and if not supplied you should query (await readDoc(submittable.verifiable, {}))\[0\] as your doc state, and set the docId to [doc.id](http://doc.id) accordingly

**This part will target only SubmissionForm components.**

- The getSubmissionFileInfo and payToSubmission now accepts an additional parameter which is the level parameter this is set to the current level of the constraintName (level not index)
- FIX and CLARIFICATION!
- The save button by default is disabled, but when changes are detected (this includes file input, text input but not payment input. Payment input is handled separately) the save button will light up (becomes not disabled)
- The lockSubmission by default is disabled and could only light up IF:

1.  all of the input is not null and the payment field value doesn't start with pending and is not null
2.  It should also be disabled if changes are detected. After the user click save changes is assumed to be none

- If the form is disabled then it should be added classname text-gray-300 for the text
- Each level now should also display the start_date and end_date by accessing submittable.levels\[i\].start_date or .end_date Consequently on the latest level we should check whether the current date is between that range, if not in the range then the form status (the unlocked or locked pill) should be set to closed.
- All of the levels that are not the latest level should be disabled regardless of wether the last level is disabled or not. 

**This part will target VerifiableForm and SubmissionForm components.**

- For the FileField on both the VerifiableForm and SubmissionForm If when trying to choose from the file picker it failed the test (i.e. MIME Type test and size test) then it should immediately be freed and the state is again set as the default state (when there are no file picked)
- After the request verify button is pressed or the lock submission is pressed then it should display confetti on the screen
- Every API function call (the function with \_C or \_S or \_SC suffix) can throw an error. The UI should ALWAYS catch this, stop any propagation from happening (i.e. stop the current operation and don't continue if the action is part of a sequence of action, implementation is by letting the function throw then catch it on the topmost level this way error will propagate and stop execution will still being catched at the top level to be displayed), and display a toast with the Error.name and Error.message (most of the time the throwed Error is an instance of ExpectedError, if by chance it’s not an instanceof ExpectedError then it should display unexpected error along with error message). The exception is when a specific error handling is specified (for example with bulk action where the error is counted and accumulated to be displayed to the user at the end). \*use the sonner toast

**Verifiable Form Spec:**

- This spec is written using the following conventions, if a function returns a promise it should always be assumed that we use await to call it
- Each function have a suffix \_S for server components \_C for client components and \_SC if can be used in both
- Constraints (or Field) for the current verifiable is attained through the getConstraints (slug) function, this will output a Verifiable–assuming that the slug given is valid–then we access the .constraints and .required_on_create for all the fields, the slug is passed in the parameter
- Below the field the form has 3 button, a requestVerify button, a save button, and a delete ${slug} button (this will be elaborated further)
- if the doc of the verifiable (will be shorted to doc from now on) exists it should display the form along with the constraints that is already filled with the value of the doc, the doc is attained by accessing the (await readDoc(slug, {}))\[0\], (if undefined then it doesn't exists)
- If doc doesn't exist it should also display the form with the fields but empty and a "Create new ${slug}" button is displayed. This button if pressed will call createDoc(slug, {}). We then query (await getDoc(slug, {}))\[0\] again to set our current doc to.
- A disabled form meaning, we can't change the value of the form nor can we use the save button and the request for verify button (the UI should make this clear, by making the button field a bit grey like usual disabled input). Important: When form is disabled the text value should be visible not opaque.
- A form is disabled when there is no doc exists (pressing the createDoc button will break this condition as it set the current doc to the newly created one)
- A form is also disabled when the doc.verified level is >= 1, but when doc.verified == 2 then the form is still disabled but the form field can be clearly looked at (i.e. not grey background).
- At the top of the form there is a status bar that receives a verifiedLevel params which is passed the doc.verified property. verifiedLevel is a number ranging from -1 to 2 inclusive. At -1 it should signal that the doc is rejected, 0 is not yet requested for verification, 1 is requested, 2 is accepted
- If the doc.message_subject or doc.message_body is set then display it on the form (this act as a feedback by admin, style this appropriately) if one or two of them has the value of "" then it is assumed that there are no message and the subject or message (this acts separately) should not be shown
- Elaborating on the save button. At first it is disabled which means it could not be pressed (UI should make this clear), but after the user changes a field it will become not disabled. If this button is pressed then it will call updateDoc(slug, InsertObj, {}). We define InsertObj as an obj with key pair value with each key is the name of the constraints (or field that we get before) and the value is the value for that field. This insertObj will include all of the constraints EXCEPT for the payment and file type. After calling the updateDoc we then iterate over all the "file" type fields. The file type fields should maintain if it been uploaded a file or not, if it is not then ignore, if it has been uploaded a file by the user then it will call then call await uploadFileToVerifiable(slug, [doc.id](http://doc.id), theConstraintName, theNewlyUploadedFile). The UI will set the field to be the saved value.
- Elaborating on the file type field: it will also receive 2 additional parameters maxInputSizeKb (constraints\[i\].max_input_size_kb as number) and mimeTypes (constraints\[i\].mime_type as string\[\]) the uploaded file should only accept the specified mimeTypes and have file size < maxInputSizeKb. When the file is already chosen by the file picker and not yet uploaded (i.e. the user hasn't pressed the save button) it could show the preview of the file if it has image MIMEType (e.g. png, jpg, jpeg, webp) and also preview the name and the size if applicable.
- If a user wants to preview an already uploaded file (i.e.the fields already has value when requested) it first will call decodeFilePath_SC(decodeSQLURL_SC(value).path) then this will output userId (the email of the owner), time (when the file uploaded), and fileName, display this information. There is also a preview file button which if pressed will call the getVerifiableFileInfo(slug, [doc.id](http://doc.id), fieldName) which will return FileInfo and use this info to display it to the user. It also has a signedUrl property which could be used to download the file if the user wants to.
- After the user press the save button, you can release the File handler and then update the value to be what you get from the uploadFileToVerifiable
- Elaborating on the requestVerify button. As explained above if doc.verified >= 1 then this button is disabled. But also at first this button is disabled by default, it will only become not disabled IFF these 3 requirements are met: 1. All constraints is not null 2. Not already verified 3. If the doc.depends_on is truthy then we iterate over the accesorArr= \[doc.creator, …doc.shared\] then we call isAccessorVerified(doc.depends_on, accessorArr\[i\]), this will output the verified level for each of the accessor, the UI should display this (display since the element is loaded not when the button is pressed), if all of the verifiedLevel of the accessors >= 1  then this requirement is met. If doc.depends_on is falsy then requirement 3 is always true. The requestVerify button should only lights up if the form has been saved not when editing
- If the requestVerifyButton is pressed then it will call requestVerify(slug, [doc.id](http://doc.id)) then we on the client (the doc state) set the doc.verified to be 1 (this is to disable the form)

Extension:

- On the first time the form load it should check for whether the user has already logged in or not, this is done by set the current user variable / state to useUser_C().user (this function will return an object {user, isLoading} the UI could handle the isLoading by suspending the UI or just let it go in the background (choose the best for UX)). If the user after isLoading becomes false still yields undefined / null (falsy value) OR user?.email_verified is falsy then there should be a notice to login first and the form will be disabled and will not run any of the functions except populating the field with getConstraints (the procedure for populating is stated above), this is done due to other functions requiring a user. As a side after this if referencing user.email it is assumed to be always exists
- The verifiableForm has a join {slug} button which will show alongside the create {slug} button (this join button should also disappear if the create button disappears, it is when doc exists). The join button comes in a packet with a predefined text input TT . XXXX. This predefined text input should only accept alphanumeric and convert all lowercase letters to uppercase (this checking and conversion is done live as the user is inputting, if rejected then changes are not reflected). The UI should show the dot separator and make this similar to code input UI (e.g. Gmail verify code input, Github 2FA code input). By default the join button is disabled and could only light up if all of the code input is already filled. If the join button is pressed it will call joinWithVerifiableCode(theCode), theCode is the inputted code (this includes also the dot ".", so end format will be "TT.XXXX"). After the call you then call (use await readDoc(slug, {}))\[0\] and set the current doc accordingly.
- Elaborating on the verified level of each accessor that has already attained, the UI should display each of the email of the accessor (i.e. accessorArr\[i\]) and its verified level. But the verified level should be mapped instead of a number; it should display a chip that has different text and color depending on the verifedLevel.
- On the side of the accessor display email the UI should display whether it is the creator of the verifiable or  "you" the user currently accessing. To check whether it is the creator just use accessorArr\[i\] === doc.creator. To check whether it is "you" just check whether user.email === accessorArr\[i\]
- More elaborating on the delete button, this should only light up IFF user.email === doc.creator else then this button is disabled
- The verifiableForm, if the doc exists, have a kick member and leave button which is to be elaborated
- Elaborating on the kick member button, this button is disabled and only not disabled when user.email === doc.creator (current user is the creator). This kick member lies on the side of each accessor, who is not the creator, email display. This button is read with white X text (though could be restyled accordingly). If the button is pressed it will call shareDoc(slug, \[\], \[accessorArr\[i\]\])
- Elaborating on the leave button and the delete button. The leave button is an alternative to the delete button. The delete button will only show up / exist only if the current user is the owner, if not then the leave button will show up / exist. The delete is disabled when the verifiedLevel >= 1. The leave button is always lit up (not disabled) and if pressed will call shareDoc(slug, \[\], user.email) and then will set the doc to be non-existent either undefined or null then we go back to the first state.
- The verifiableForm should also display a {slug} code which is the doc.verifiableCode
- The text input should validate the input by checking (new Blob(value).size) \* 1024 should always <= max_input_kb
- On every fields if the constraints\[i\].ui_title is defined then the title of the field is ui_title if doesnt exists then use the name, in addition to that if the constraints\[i\].ui_descriptions exists then the field should display it below the title (exists for ui_description and ui_title is truthy and value !== “”)

Fix and clarification:

- Make sure the dependency status is not outputting undefined on the verifiedLevel after sharing
- Add a caching mechanism in which the components should accept all states as params with param naming convention \_stateName and optional. If the param exists dont query and use the given param if undefined then do as what is already instructed.

**Submission Form Spec:**

- This spec is written using the following conventions, if a function returns a promise it should always be assumed that we use await to call it
- Each function have a suffix \_S for server components \_C for client components and \_SC if can be used in both
- The submission components should display “basic info” and levels along with the fields (alternatively called constraints) of each levels. This 2 are to be elaborated below.
- Each Submission Form component should fetch this variable / state: 1. The submit is done by fetching getSubmission(docId, submittableSlug).submittable, the docId and submittableSlug is passed on from the params. 2. The submission (differentiate these from submittable), this is done by fetching getSubmission(docId, submittableSlug).submission (in practice only call the function once, just as getting submittable, but accessing the different property). 3. The one who make the submission (called doc) by fetching (await readDoc(submittable.verifiable, { id: docId }))\[0\]
- Now it is safe to assume doc and submittable always exists because failing to to do so would yield in an error thrown by the fetching function. The submission could be null meaning the user hasn't made a ny submission (we call this condition the submission does not exists)
- The submission should be disabled when doc.verified !== 2
- Elaborating on basic info, it should display “${submittableSlug} submission by ${doc.slug} code ${doc.verifiableCode}”. It also displays the locked status by accessing submission.locked: 0 means unlocked, 1 means locked, 2 mean locked and reviewed. It should also display the current level by accessing submission.level
- Elaborating on the fields. The components should display form like fields for each constraints for each level. Level array is submittable.levels (this is different from submittable.level) then on each submittable.levels\[i\].constraints (refer to this as levelConstraintsArr) contains the constraints / fields (i.e that is an object with the following property levelConstraintsArr\[j\] = { name, type, max_input_kb, ui_title, ui_description }. The fields should handle multiple fied type: number, text, file (to be elaborated), payment, boolean. Each field (whatever type) should display ui_title as title if exists, if ui_title doesn't exits then use name, below that if ui_description exists display ui_description (exists for ui_description and ui_title is truthy and value !== “”) below that is the actual input field that is specific towards each type.
- If the submission.message_subject or submission.message_body is set then display it on the form (this act as a feedback by admin, style this appropriately) if one or two of them has the value of "" then it is assumed that there are no message and the subject or message (this acts separately) should not be shown
- Below the form there is a save button. At first it is disabled which means it could not be pressed (UI should make this clear), but after the user changes a field it will become not disabled. If this button is pressed then it will call updateSubmission(doc.id, submittableSlug, InsertObj). We define InsertObj as an obj with key pair value with each key is the name of the constraints (or field that we get before) and the value is the value for that field. This insertObj will include all of the constraints EXCEPT for the payment and file type. After calling the updateDoc we then iterate over all the "file" type fields. The file type fields should maintain if it been uploaded a file or not, if it is not then ignore, if it has been uploaded a file by the user then it will call then call await uploadFileToSubmission([doc.id](http://doc.id), submittableSlug, theConstraintName, theNewlyUploadedFile). The UI will set the field to be the saved value.
- Elaborating on the file type field: it will also receive 2 additional parameters maxInputSizeKb (levelConstraintsArr\[i\].max_input_size_kb as number) and mimeTypes (levelConstraitsArr\[i\].mime_type as string\[\]) the uploaded file should only accept the specified mimeTypes and have file size < maxInputSizeKb. When the file is already chosen by the file picker and not yet uploaded (i.e. the user hasn't pressed the save button) it could show the preview of the file if it has image MIMEType (e.g. png, jpg, jpeg, webp) and also preview the name and the size if applicable.
- If a user wants to preview an already uploaded file (i.e.the fields already has value when requested) it first will call decodeFilePath_SC(decodeSQLURL_SC(value).path) then this will output userId (the email of the owner), time (when the file uploaded), and fileName, display this information. There is also a preview file button which if pressed will call the getSubmissionFileInfo(doc.id, submittableSlug, fieldName) which will return FileInfo and use this info to display it to the user. It also has a signedUrl property which could be used to download the file if the user wants to.
- After the user press the save button, you can release the File handler and then update the value to be what you get from the uploadFileToSubmission
- Elaborating on the lock button. The lock button text display is submitted but we refer to this as the lock button. If submission.locked >= 1 then this button is disabled. But also at first this button is disabled by default, it will only become not disabled IF these 3 requirements are met: 1. All constraints are not null 2. Not already locked 3. The form is not disabled (i.e doc.verified < 2)
- If the lock submission button  is pressed then it will call lockSubmission(doc.id submittableSlug) then we on the client (the submission state) set the submission.locked to be 1 (this is to disable the form)
- For each level that has index < submission.level-1 then it should be assumed that the value already exists for all constraints for that level and should already be locked (or disabled), please note that the locked and save button is only 1 which is at the very bottom and the action always refers to the latest level. If submission.level > submittables.levels.length then the form and lock button is ALWAYS disabled
- The text input should validate the input by checking (new Blob(value).size) \* 1024 should always <= max_input_kb

Fix and clarifications:

- docId as a params is optional, and if not supplied you should query (await readDoc(submittable.verifiable, {}))\[0\] as your doc state, and set the docId to [doc.id](http://doc.id) accordingly

**This part will target only SubmissionForm components.**

- The getSubmissionFileInfo and payToSubmission now accepts an additional parameter which is the level parameter this is set to the current level of the constraintName (level not index)
- FIX and CLARIFICATION!
- The save button by default is disabled, but when changes are detected (this includes file input, text input but not payment input. Payment input is handled separately) the save button will light up (becomes not disabled)
- The lockSubmission by default is disabled and could only light up IF:

1.  all of the input is not null and the payment field value doesn't start with pending and is not null
2.  It should also be disabled if changes are detected. After the user click save changes is assumed to be none

- If the form is disabled then it should be added classname text-gray-300 for the text
- Each level now should also display the start_date and end_date by accessing submittable.levels\[i\].start_date or .end_date Consequently on the latest level we should check whether the current date is between that range, if not in the range then the form status (the unlocked or locked pill) should be set to closed.
- All of the levels that are not the latest level should be disabled regardless of wether the last level is disabled or not. 

**This part will target VerifiableForm and SubmissionForm components.**

- For the FileField on both the VerifiableForm and SubmissionForm If when trying to choose from the file picker it failed the test (i.e. MIME Type test and size test) then it should immediately be freed and the state is again set as the default state (when there are no file picked)
- After the request verify button is pressed or the lock submission is pressed then it should display confetti on the screen
- Every API function call (the function with \_C or \_S or \_SC suffix) can throw an error. The UI should ALWAYS catch this, stop any propagation from happening (i.e. stop the current operation and don't continue if the action is part of a sequence of action, implementation is by letting the function throw then catch it on the topmost level this way error will propagate and stop execution will still being catched at the top level to be displayed), and display a toast with the Error.name and Error.message (most of the time the throwed Error is an instance of ExpectedError, if by chance it’s not an instanceof ExpectedError then it should display unexpected error along with error message). The exception is when a specific error handling is specified (for example with bulk action where the error is counted and accumulated to be displayed to the user at the end). \*use the sonner toast

**—- ADMIN PAGE SPEC —-**

**Verifiable Admin Spec:**

- The UI of this admin page should mimic the style of shadcn/ui and or payload CMS admin UI. The components should ALWAYS resort to using@payloadcms/ui prebuilt components for styling consistencies whenever it could.
- This spec is written using the following conventions, if a function returns a promise it should always be assumed that we use await to call it
- Each function have a suffix \_S for server components \_C for client components and \_SC if can be used in both
- At the top of the view there is a pages selection (this is for pagination). There is a **nowPage** state that saves what pages currently we are viewing, this state has a default value of 1. There is also a **totalCount** state that saves how many docs that existed disregarding the paging, this has defaultValue of 0. The pages selection has a minimum and minimal value of 1 and has the max value of Math.max(Math.ceil(totalCount / parseInt(process.env.NEXT_PUBLIC_ADMIN_PAGING_LIMIT!),1))
- Below that there are 4 input fields: 

1.  The first one is a text input named **verifiableSlug**
2.  The second one is the orderBy field (this field consists of 1 text input (named **orderByField**) and 1 select input (named **orderByIsAsc**) with value either 1 (for ascending) or 0 (for descending))
3.  The third one is a checkbox input (named **shouldPopulate**) this has default value of false
4.  The fourth one is the filter input (named **where**). This is a JSON where users could add fields, remove fields, create nested fields just as creating a JSON object, note that the end value for each key is either string,number,boolean (of course this is excluding nested objects). (The end result that will be consumed is a javascript object corresponding to the JSON inputted by the user)

- Elaborating on the input field styling. It should span the whole horizontal screen.
- There is a state called **adminDocs**: AdminSQLRow\[\] that saves the docs that are retrieved. At first this is an empty array and will only be populated after the action explained below.
- There is a state called **verifiable** that is the verifiable that is basing this whole components
- Below or on the side (the choice made should be based on the most common implementation) the three form there is an apply button that when pressed will refetch and re-set the whole adminDocs state by calling await readDoc(verifiableSlug, where, {page: nowPage, shouldPopulate, orderBy: orderByObject }). orderByObject if both the orderByField and orderByIsAsc both defined then oderByObject is { field: orderByField, isAsc: orderByIsAsc } else it is undefined
- forEach element in the adminDocs (i.e. adminDocs\[i\]) let's call it **adminDoc** (without s). This adminDoc should be passed as the parameter for the **DocReview** component.
- Elaborating on the DocReview component. This should display all of the fields that are contained in the adminDoc excluding the \_msyssec, \_msysrevsec, dependsOnArr, and, dependedByArr property. There is also an internal variable named **shouldExpand** this value is by default false but true If the shouldPopulate is checked and the **expandButton** is pressed (_this will be elaborated_). If shouldExpand is true then it should expand and try to display all member of the adminDoc.dependsOnArr and adminDoc.dependedByArr and also for every property of the adminDoc that has the type of file (this is checked by 1st iterating over verifiable.constraints and verifiable.required_on_create (if exists) and assign a **fieldMapping** object by fieldMapping\[now\[i\].name\] = now\[i\].type after all the mapping that is done only once at first fetched, the checking is done by fieldMapping\[toBeChecked\] === "file") it should display a preview of the file if exists
- If a user wants to preview an already uploaded file (i.e.the fields already has value when requested, not undefined) it first will call decodeFilePath_SC(decodeSQLURL_SC(value).path) then this will output userId (the email of the owner), time (when the file uploaded), and fileName, display this information. There is also a preview file button which if pressed will call the getVerifiableFileInfo(verifiableSlug, adminDoc.id, fieldName) which will return FileInfo and use this info to display it to the user. It also has a signedUrl property which could be used to download the file if the user wants to. If the file extension is sensed to be an image it should display with the link of the freshly attained signedUrl
- Elaborating on the expandButton. It should only be displayed if the shouldPopulate is false. If it is shown and pressed then it will update ONLY its adminDoc with the await readDoc(verifiableSlug, {...where, id: adminDoc.id}, {page: nowPage, true, orderBy: orderByObject }) and it should set the shouldExpand for the component to true and thus mimicking the shouldExpand behaviour
- On the side of each DocReview and aside of each of the elements of doc.dependsOnArray component it has 2 buttons, 1 text input, and 1 text area input: button 1 for accept and 1 for reject, text input named **messageSubjectInput**, textarea input named **messageBodyInput**. This 2 text and textarea input can’t be null / undefined and will always default to “”
- After the accept button is pressed it should prompt the user 3 times for whether the user wants to accept the docs or not and also a warning that THIS ACTION CAN'T BE UNDO and All related parties will be sent an email according to messageSubjectInput and messageBodyInput. If the shouldExpand is true then an additional check is made, the button could only be not disabled if all the adminDoc.dependsOnArr\[i for all elements\].verified === 2. If successfully pressed it will call verifyDoc(verifiableSlug, [adminDoc.id](http://admindoc.id), true, messageSubjectInput, messageBodyInput). Only when the accept button is pressed the component should handle the exception and check whether it is a VerifiableError.VerifucationFail if it does then it should warn the user that the document could only be accepted if all the depends_on is accepted. Else then proceed to the default errorHandler
- After the reject button is pressed it should prompt the user 3 times for whether the user want to REALLY rejects this doc, it should also come with a warning that ALL DEPENDED_BY DOCUMENTS WILL BE REJECTED ALSO AND CAN'T BE UNDO and All related parties will be sent an email according to messageSubjectInput and messageBodyInput. If successfully pressed it will call verifyDoc(verifiableSlug, [adminDoc.id](http://admindoc.id), false, messageSubjectInput, messageBodyInput)
- For each function call there could be an error the components should catch it and delegate it to a defaultErrorHandler. The defaultErrorHandler job is to create a toast or an alert based on the Error (Differentiate the handling of an instance of ExpectedError and not)

**This prompt targets the admin/SubmissionView components.**

The SubmissionView should have all the features that the VerifiableView has. Thus it first should copy all of the contents of the file to the SubmissionView.

After that, modify the SubmissionView according to this changes spec:

\- The input field for the Verifiable Slug is now changed to Submittable Slug

\- The expand button is a bit different it now depends on the so called ViewOnlyDocReview components, as the expansion in submission context is expanding on the Verifiable that is linked to the submission thus expansion is done by querying submission.verifiableId with slug submittable.verifiable this will then be passed and viewed on ViewOnlyDocReview (the ViewOnlyDocReview is the same as DocReview but lacks the functionality for checkboxes, reject, accept, delete, and expand)

\- For the SubmissionReview components (this replaces DocReview) The individual field (i.e. the one that is responsible for rendering payment type or file type, etc) is the same, but differs on how the data is attained. As Submission consists of multiple levels and each level has its own constraints thus it will mimic a hierarchy. At the root display all of the Submission property (except the levels array). Then also at the root level there should be a section called levels. Each level is displayed in an isolated component (called RenderLevel) and the input param for the components is levels\[i\].constraints (we call this input) and submittable.levels\[i\].constraints (we call this constraintsArr). RenderLevel is responsible for iterating over constraintsArr and displaying it accordingly based on the input value (use specific components for type file and payment, all features of this are the same as the VerifiableView hint:fieldMapping\[key\]). If an input is undefined, submission.levels\[i\] === undefined, (this should be check first to avoid accessing undefined.constraints) then it should display the text None

\- The reject and accept button is now NEVER DISABLED EXCEPT: 1. WHEN SUBMISSION.LEVEL > SUBMITTABLE.LEVELS.LENGTH (this condition is true for both accept and reject button, remove all of the disabled logic checking from the VerifiableView) 2. For the reject button it will also be disabled if submission.locked === 2

\- Elaborating on the function call, in essence it will change all of the verifiable calling function to its counterpart submission calling function:

- getVerifiable_C, readDoc_C, deleteDoc_C, verifyDoc_C, getVerifiableFileInfo_C
- getSubmittable_C, getSubmission_C, deleteSubmission_C, lockSubmission, getSubmissionFileInfo_C

On the function call if EVEN THE SLIGHTEST confusion about the parameter it should be reprompt and asked for manual review

**LATEST CLARIFICATION**

**This part will target VerifiableView and SubmissionView**

- Every API function call (the function with \_C or \_S suffix) can throw an error. The UI should ALWAYS catch this, stop any propagation from happening (i.e. stop the current operation and don't continue if the action is part of a sequence of action, implementation is by letting the function throw then catch it on the topmost level this way error will propagate and stop execution will still being catched at the top level to be displayed), and display a toast with the Error.name and Error.message (most of the time the throwed Error is an instance of ExpectedError, if by chance it’s not an instanceof ExpectedError then it should display unexpected error along with error message). The exception is when a specific error handling is specified (for example with bulk action where the error is counted and accumulated to be displayed to the user at the end). \*if applicable should always use payload toast
- For the submittable slug and verifiable slug input it should be checked before clicking apply (if error then it will display a toast). The condition is 1. not null or empty 2. only consists of lowercase alphanumeric and underscore
- For both VerifiableView and SubmissionView add 2 action and bulk action the button for this  is placed below the message subject and message body input. This is called “send message” and “send message without email” button. It is never disabled and the behavior for bulk action is the same as other bulk action. When pressed this button will call the sendMessageToVerifiable or sendMessageToSubmission for VerifiableView and SubmissionView respectively. The difference between the send message and send message without email button is only on the last parameter sendEmail where the latter should set this param to false and the earlier is set to true. Of course after this call the document / submission state should be updated

**This part will target  SubmissionView only:**

- The ReviewSubmission checkbox should be inside the box (just like DocReview checkbox)
- The ReviewSubmission SHOULD NOT hinder any of the property underlying the Submission property, display all the property that the submission has ALL OF THEM . (e.g message_subject, the underlying constraints is obj.levels\[i\].constraints\[j\] show the constraints as KEY and the value is the collection of fields, this is to mimic and display the REAL object property). Alongside this it should ALWAYS try to display all levels even if the submission doesn't exist (this is done by iterating the submittable instead of the submission). If the levels in the submission don't exist it should display the text “None” on that level field.
- The SubmissionReview component should make a UI exception on the level (non plural) property of the Submission. Amplify it by using bold and a light color rounded square background overlay around the level number (the color of the background overlay is randomly generated from the level)
- The SubmissionReview component should display the locked status more clearly. It should be grayed out if locked === 0 or 2. 
- Automatically update the state of the submission after calling an API function that changes the state of the submission. This is done by refetching the new data for THE CURRENT SUBMISSION ONLY (use getSubmission_C(-1, submittableSlug, { page: 1, where: { verifiableId: submission.verifiableId }})\[0\]. An exception when deleting, just delete the component. 
- Add more confirmation for the bulk action (accept, reject, delete, send message), this should roughly be the same as the VerifiableView but without the verdict checking (just make sure the amount asked is the same)
- Modify the getSubmissionFileInfo to add level (this parameter is set as the current level, level not index, of the requested constraint)
