/**
 * @NApiVersion 2.1
 * @NScriptType MapReduceScript
 */
/**********************************************************************************************
* Client Name
*
*
*
${OTP-8879}:{Monthly Over Due Reminder for Customer}
*
*
**************************************************************************************************
*
*Author:Jobin and Jismi IT Services
*
*Date Created:28-may-2025
*
*Description:This Map/Reduce script will automate monthly overdue invoice notifications in NetSuite. It will retrieve overdue invoices, group them by customer, and attach them as a CSV file in an email. The sender will be the Sales Rep or a static NetSuite Admin if no Sales Rep is assigned 
*
*REVISION HISTORY
*@version 1.0 30-may-2025 :Created the initial build by JJ0402
*/
define(["N/email", "N/file", "N/log", "N/record", "N/search"], /**
 * @param{email} email
 * @param{file} file
 * @param{log} log
 * @param{record} record
 * @param{search} search
 */ (email, file, log, record, search) => {
  /**
   * Defines the function that is executed at the beginning of the map/reduce process and generates the input data.
   * @param {Object} inputContext
   * @param {boolean} inputContext.isRestarted - Indicates whether the current invocation of this function is the first
   *     invocation (if true, the current invocation is not the first invocation and this function has been restarted)
   * @param {Object} inputContext.ObjectRef - Object that references the input data
   * @typedef {Object} ObjectRef
   * @property {string|number} ObjectRef.id - Internal ID of the record instance that contains the input data
   * @property {string} ObjectRef.type - Type of the record instance that contains the input data
   * @returns {Array|Object|Search|ObjectRef|File|Query} The input data to use in the map/reduce process
   * @since 2015.2
   */

  const getInputData = (inputContext) => {
    try {
      let inv = invoiceSearch();
      return inv;
    } catch (error) {
      log.debug("error", error.message);
    }
  };

  /**

   *
   * Defines the function that is executed when the map entry point is triggered. This entry point is triggered automatically
   * when the associated getInputData stage is complete. This function is applied to each key-value pair in the provided
   * context.
   * @param {Object} mapContext - Data collection containing the key-value pairs to process in the map stage. This parameter
   *     is provided automatically based on the results of the getInputData stage.
   * @param {Iterator} mapContext.errors - Serialized errors that were thrown during previous attempts to execute the map
   *     function on the current key-value pair
   * @param {number} mapContext.executionNo - Number of times the map function has been executed on the current key-value
   *     pair
   * @param {boolean} mapContext.isRestarted - Indicates whether the current invocation of this function is the first
   *     invocation (if true, the current invocation is not the first invocation and this function has been restarted)
   * @param {string} mapContext.key - Key to be processed during the map stage
   * @param {string} mapContext.value - Value to be processed during the map stage
   * @since 2015.2
   */

  const map = (mapContext) => {
    try{
    let invoiceValue = JSON.parse(mapContext.value);

    let salesRep = invoiceValue["values"]["salesrep"]["value"] || " ";
    log.debug("salesrep from invoice:",salesRep);
    let invoiceNumber = invoiceValue["id"];
    let amount = invoiceValue["values"]["amount"];
    let cusId = invoiceValue["values"]["entity"]["value"];
    let cusName = invoiceValue["values"]["entity"]["text"];
    let dueDate = invoiceValue["values"]["duedate"];
        log.debug("cusid",cusId);
    let cusData = customerData(cusId);
    let cusEmail = cusData.email;
    let cusSalesRep = cusData.salesRep;
    let cusSalesRepName = cusData.salesRepName;
    let empSalesRep = getSalesRepDetails(cusSalesRep);
    let inActive = empSalesRep.isInactive;
    log.debug("inactive:",inActive);
    log.debug("salesrep from customer:",cusSalesRep);
   
    let daysOverdue = calculateDaysBetween(dueDate);
    let Data = {
      cusName,
      cusEmail,
      invoiceNumber,
      amount,
      cusSalesRep,
      daysOverdue,
      cusSalesRepName,
      inActive
    };

    mapContext.write({
      key: cusId,
      value: Data,
    });
  }
  catch(error)
{
  log.debug("error",error.message)
}  };

  /**
   * Defines the function that is executed when the reduce entry point is triggered. This entry point is triggered
   * automatically when the associated map stage is complete. This function is applied to each group in the provided context.
   * @param {Object} reduceContext - Data collection containing the groups to process in the reduce stage. This parameter is
   *     provided automatically based on the results of the map stage.
   * @param {Iterator} reduceContext.errors - Serialized errors that were thrown during previous attempts to execute the
   *     reduce function on the current group
   * @param {number} reduceContext.executionNo - Number of times the reduce function has been executed on the current group
   * @param {boolean} reduceContext.isRestarted - Indicates whether the current invocation of this function is the first
   *     invocation (if true, the current invocation is not the first invocation and this function has been restarted)
   * @param {string} reduceContext.key - Key to be processed during the reduce stage
   * @param {List<String>} reduceContext.values - All values associated with a unique key that was passed to the reduce stage
   *     for processing
   * @since 2015.2
   */
  const reduce = (reduceContext) => {
    try{
    log.debug("reduceData", reduceContext.values);

    let csvContent = "Customer,Email,Invoice Number,Amount,Days Overdue\n";

    reduceContext.values.forEach(function (invoice) {
      var data = JSON.parse(invoice);
      csvContent += `${data.cusName},${data.cusEmail},${data.invoiceNumber},${data.amount},${data.daysOverdue}\n`;
    });

    let csvFile = file.create({
      name: "Overdue_Invoices.csv",
      fileType: file.Type.CSV,
      contents: csvContent,
    });

    let firstInvoice = JSON.parse(reduceContext.values[0]);
    //log.debug("inactive......",firstInvoice.inActive);
    
   
    let sender =
      firstInvoice.cusSalesRep && firstInvoice.cusSalesRep !== " " && firstInvoice.inActive !== true
        ? firstInvoice.cusSalesRep
        : -5;
    log.debug("sender......",sender);

  email.send({
  author: sender,
  recipients: reduceContext.key,
  subject: "Monthly Overdue Invoice Reminder",
  body: `
    Dear ${firstInvoice.cusName},\n


    I hope this email finds you well.


    Please find attached a list of overdue invoices for your review. Kindly go through the details and let us know if you have any questions or require any assistance.


    We appreciate your prompt attention to this matter and request that payments be processed at the earliest to avoid further delays.\n


    Best regards, 

    ${sender === -5 ? "Cathy Cadigan" : firstInvoice.cusSalesRepName}
  `,
  attachments: [csvFile],
});
}
    catch(error)
    {
      log.error("error",error.message)

    }
  };

  /**
   * Defines the function that is executed when the summarize entry point is triggered. This entry point is triggered
   * automatically when the associated reduce stage is complete. This function is applied to the entire result set.
   * @param {Object} summaryContext - Statistics about the execution of a map/reduce script
   * @param {number} summaryContext.concurrency - Maximum concurrency number when executing parallel tasks for the map/reduce
   *     script
   * @param {Date} summaryContext.dateCreated - The date and time when the map/reduce script began running
   * @param {boolean} summaryContext.isRestarted - Indicates whether the current invocation of this function is the first
   *     invocation (if true, the current invocation is not the first invocation and this function has been restarted)
   * @param {Iterator} summaryContext.output - Serialized keys and values that were saved as output during the reduce stage
   * @param {number} summaryContext.seconds - Total seconds elapsed when running the map/reduce script
   * @param {number} summaryContext.usage - Total number of governance usage units consumed when running the map/reduce
   *     script
   * @param {number} summaryContext.yields - Total number of yields when running the map/reduce script
   * @param {Object} summaryContext.inputSummary - Statistics about the input stage
   * @param {Object} summaryContext.mapSummary - Statistics about the map stage
   * @param {Object} summaryContext.reduceSummary - Statistics about the reduce stage
   * @since 2015.2
   */
  const summarize = (summaryContext) => {
    log.audit("Map/Reduce Summary", "Completed processing overdue invoices.");
  };

  /**
   * Calculates the number of days between the current date and a given due date.
   * @param {string|Date} dueDate - The due date to compare with today's date.
   * @returns {number} The absolute difference in days between today and the due date.
   * @since 2025.1
   */

  function calculateDaysBetween(dueDate) {
    try{
    let today = new Date();
    let due = new Date(dueDate);
    let differenceInTime = today.getTime() - due.getTime();
    let differenceInDays = Math.abs(differenceInTime / (1000 * 60 * 60 * 24));
    //log.debug("differenceInDays", Math.floor(differenceInDays));

    return Math.floor(differenceInDays);
    }
    catch(error)
    {
      log.debug("error",error.message);
    }
  }

  /**
   * Creates a saved search to retrieve open invoices based on specific filters.
   * @returns {invoiceSearch} The search object for open invoices.
   * @since 2025.1
   */

  function invoiceSearch() {
    try{
    let invoiceSearch = search.create({
      type: search.Type.INVOICE,
      title: "Open Invoice Search JJ",
      id: "_jj_open_invoice_search_task1",
      filters: [
        ["mainline", "is", "true"],
        "AND",
        ["customer.isinactive","is","F"],
        "AND",
        ["duedate", "onorbefore", "lastmonth"],
        "AND",
        ["status", "anyof", "CustInvc:A"]        
      ],
      columns: ["tranid", "entity", "salesrep", "amount", "duedate"],
    });
    return invoiceSearch;
  }
   catch(error)
    {
      log.debug("error",error.message);
    }
  }

  /**
   * Retrieves the email address of a customer based on their internal ID.
   * @param {number|string} cusId - The internal ID of the customer record.
   * @returns {string} The customer's email address, or an empty string if not found.
   * @since 2025.1
   */
function customerData(cusId) {
    try {
        let customerData = search.lookupFields({
            type: search.Type.CUSTOMER,
            id: cusId,
            columns: ["email", "salesrep"]
        });

        let email = customerData.email || "Not Available";
        let salesRep = customerData.salesrep[0]?.value || " ";
        let salesRepName = customerData.salesrep[0]?.text || " ";

        log.debug("salesrep:", salesRep);

        return { email, salesRep, salesRepName };
    } catch (error) {
        log.debug("Error", error.message);
        return { email: "Error Retrieving Data", salesRep: "Error Retrieving Data" };
    }
}
/**
 * Retrieves the inactivity status of a sales representative.
 *
 * @param {string|number} salesRepId - The internal ID of the sales representative.
 * @returns {Object} An object containing the inactivity status.
 * @property {boolean} isInactive - Indicates whether the sales representative is inactive.
 */
function getSalesRepDetails(salesRepId) {
    try {
        let salesRepRecord = search.lookupFields({
            type: search.Type.EMPLOYEE,
            id: salesRepId,
            columns : ['isinactive']
        });

        let isInactive = salesRepRecord.isinactive;
        
        return { isInactive};
    } catch (error) {
        log.debug("Error", error.message);
        return { isInactive: true, salesRepName: "Not Available" };
    }
}

  return { getInputData, map, reduce, summarize };

});
